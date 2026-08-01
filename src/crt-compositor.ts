import {Canvas2DRenderer} from './canvas2d-renderer.js';
import {CRTCanvasBackend} from './crt-canvas-backend.js';
import {CRTGLBackend} from './crt-gl-backend.js';
import {LABEL_FONT_FAMILY, loadLabelFont} from './crt-label-font.js';
import {WebGLRenderer} from './webgl-renderer.js';
import type {JSMpegOptions, PlaneData, Renderer, StreamState, StreamStateSink} from './types.js';


export interface CRTOptions {
    /** Seconds without a decoded frame before snow begins. Default 0.05. */
    deadband?: number;
    /** Seconds for snow to ease 0→full once past the deadband. Default 1.2. */
    ramp?: number;
    /** Fraction of the previous snow field kept each tick (phosphor). Default 0.2. */
    phosphorBlend?: number;
    /** Seconds of full snow held before the hard-cut to the test card. Default 0.2. */
    snowHold?: number;
    /** Seconds of black on acquire before the picture drops in. Default 0.5. */
    tuneInBlack?: number;
    /** Seconds the corner label lingers after an acquire. Default 2. */
    labelHold?: number;
    /** Scanline strength, 0..1. Default 0.12. */
    scanlines?: number;
    /** Corner channel-label text baked over the picture on acquire. Default 'VIDEO 1'. */
    label?: string;
    /** Label font size as a fraction of frame height (resolution-independent). Default 0.06. */
    labelScale?: number;
    /**
     * Seconds without a frame before the feed is assumed lost, used only until
     * `setStreamState()` is first called (real state wins after). Default 4.
     */
    lostTimeout?: number;
}

export interface ResolvedCRTOptions {
    deadband: number;
    ramp: number;
    phosphorBlend: number;
    snowHold: number;
    tuneInBlack: number;
    labelHold: number;
    scanlines: number;
    label: string;
    labelScale: number;
    lostTimeout: number;
}

export function labelLayout(
    cfg: ResolvedCRTOptions,
    width: number,
    height: number
): { font: string; x: number; y: number } {
    const fontPx = Math.max(8, Math.round(height * cfg.labelScale));
    const margin = Math.round(fontPx * 0.7);
    return {font: `bold ${fontPx}px '${LABEL_FONT_FAMILY}', monospace`, x: width - margin, y: margin};
}

export interface CRTLevels {
    noise: number; // snow amount
    standby: number; // test card (no signal)
    black: number; // tune-in black
    label: number; // corner label opacity
}

export interface CRTBackend {
    resize(width: number, height: number): void;

    bakeLabel(text: string): void;

    captureVideo(source: HTMLCanvasElement): void;

    present(levels: CRTLevels): void;

    destroy(): void;
}

function resolveCRTOptions(config: CRTOptions | undefined): ResolvedCRTOptions {
    const o: CRTOptions = config ?? {};
    return {
        deadband: o.deadband ?? 0.05,
        ramp: o.ramp ?? 1.2,
        phosphorBlend: o.phosphorBlend ?? 0.2,
        snowHold: o.snowHold ?? 0.2,
        tuneInBlack: o.tuneInBlack ?? 0.5,
        labelHold: o.labelHold ?? 2,
        scanlines: o.scanlines ?? 0.12,
        label: o.label ?? 'VIDEO 1',
        labelScale: o.labelScale ?? 0.06,
        lostTimeout: o.lostTimeout ?? 4,
    };
}

function smoothstep(a: number, b: number, x: number): number {
    if (b <= a) {
        return x < a ? 0 : 1;
    }
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

export class CRTCompositor implements Renderer, StreamStateSink {
    enabled = true;

    readonly canvas: HTMLCanvasElement;
    private ownsCanvasElement: boolean;

    private base: Renderer;
    private videoCanvas: HTMLCanvasElement;
    private backend: CRTBackend;

    private cfg: ResolvedCRTOptions;
    private width: number;
    private height: number;

    private lastFrameAt: number;
    private lastTickAt: number;
    private noiseP = 0;
    private frameArrived = false;
    private everConnected = false;
    private standbyOn = false;
    private saturatedSince: number | null = null;
    private wasLive = false;
    private sawStandby = true;
    private channelStartAt = -1e12;

    private streamStateWired = false;
    private streamConnected = true;

    private animationId: number | null = null;
    private paintedOnce = false;
    private prev: CRTLevels = {noise: -1, standby: -1, black: -1, label: -1};

    private tickBound: (now: number) => void;
    private visibilityBound: () => void;
    private destroyed = false;

    constructor(options: JSMpegOptions, config?: CRTOptions) {
        this.cfg = resolveCRTOptions(config);

        if (options.canvas) {
            this.canvas = options.canvas;
            this.ownsCanvasElement = false;
        } else {
            this.canvas = document.createElement('canvas');
            this.ownsCanvasElement = true;
        }

        this.width = (options.videoWidth || this.canvas.width || 0) | 0;
        this.height = (options.videoHeight || this.canvas.height || 0) | 0;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.videoCanvas = document.createElement('canvas');
        this.videoCanvas.width = this.width;
        this.videoCanvas.height = this.height;

        const useGl = !options.disableGl && WebGLRenderer.IsSupported();

        const baseOptions: JSMpegOptions = {
            ...options,
            canvas: this.videoCanvas,
            createRenderer: undefined,
            preserveDrawingBuffer: true,
        };
        this.base = useGl ? new WebGLRenderer(baseOptions) : new Canvas2DRenderer(baseOptions);
        this.base.resize(this.width, this.height);

        this.backend = useGl
            ? new CRTGLBackend(this.canvas, this.cfg, {preserveDrawingBuffer: false})
            : new CRTCanvasBackend(this.canvas, this.cfg);

        this.lastFrameAt = performance.now();
        this.lastTickAt = this.lastFrameAt;

        this.tickBound = (now: number) => this.tick(now);
        this.visibilityBound = () => this.onVisibility();
        document.addEventListener('visibilitychange', this.visibilityBound);

        this.animationId = requestAnimationFrame(this.tickBound);

        loadLabelFont().then(() => {
            if (this.destroyed) {
                return;
            }

            this.backend.bakeLabel(this.cfg.label);
            this.paintedOnce = false; // Redraw
        }).catch(console.warn);
    }

    render(y: PlaneData, cb: PlaneData, cr: PlaneData, isClampedArray?: boolean): void {
        if (!this.enabled) {
            return;
        }

        this.base.render(y, cb, cr, isClampedArray);
        this.backend.captureVideo(this.videoCanvas);
        this.frameArrived = true;
        this.lastFrameAt = performance.now();
        this.everConnected = true;
    }

    renderProgress(_progress: number): void {
        // Before the source is established the present loop already shows the test
        // card (everConnected === false); nothing to draw here.
    }

    resize(width: number, height: number): void {
        this.width = width | 0;
        this.height = height | 0;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.videoCanvas.width = this.width;
        this.videoCanvas.height = this.height;
        this.base.resize(this.width, this.height);
        this.backend.resize(this.width, this.height);
        // Force a repaint at the new size.
        this.prev = {noise: -1, standby: -1, black: -1, label: -1};
        this.paintedOnce = false;
    }

    destroy(): void {
        this.destroyed = true;

        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        document.removeEventListener('visibilitychange', this.visibilityBound);
        this.backend.destroy();
        this.base.destroy();
        if (this.ownsCanvasElement) {
            this.canvas.remove();
        }
    }

    setStreamState(state: StreamState): void {
        this.streamStateWired = true;
        this.streamConnected = state === 'streaming' || state === 'stalled';
    }

    setLabel(text: string): void {
        this.cfg.label = text;
        this.backend.bakeLabel(text);

        this.paintedOnce = false;
    }

    private onVisibility(): void {
        if (document.visibilityState === 'visible') {
            const t = performance.now();
            this.lastFrameAt = t;
            this.lastTickAt = t;
        }
    }

    private tick(now: number): void {
        this.animationId = requestAnimationFrame(this.tickBound);

        if (document.visibilityState !== 'visible') {
            this.lastTickAt = now;
            this.lastFrameAt = now;
            return;
        }

        const dt = Math.min((now - this.lastTickAt) / 1000, 0.1);
        this.lastTickAt = now;
        const sinceFrame = (now - this.lastFrameAt) / 1000;

        const target = sinceFrame > this.cfg.deadband ? 1 : 0;
        const step = this.cfg.ramp > 0 ? dt / this.cfg.ramp : 1;
        if (this.standbyOn && target === 0) {
            this.noiseP = 0;
        } else {
            this.noiseP = Math.max(0, Math.min(1, this.noiseP + (target === 1 ? step : -step)));
        }
        const noise = smoothstep(0, 1, this.noiseP);

        const lost = this.streamStateWired ? !this.streamConnected : sinceFrame > this.cfg.lostTimeout;

        if (!this.everConnected) {
            this.standbyOn = true;
        } else if (lost && noise >= 0.98) {
            if (this.saturatedSince === null) {
                this.saturatedSince = now;
            }

            this.standbyOn = (now - this.saturatedSince) / 1000 >= this.cfg.snowHold;
        } else {
            this.saturatedSince = null;
            if (noise < 0.98) {
                this.standbyOn = false;
            }
        }
        const standby = this.standbyOn ? 1 : 0;

        if (this.standbyOn) {
            this.sawStandby = true;
        }
        const isLive = noise < 0.02 && !this.standbyOn;
        if (isLive && !this.wasLive && this.sawStandby) {
            this.channelStartAt = now;
            this.sawStandby = false;
        }
        this.wasLive = isLive;

        const sinceStart = now - this.channelStartAt;
        const black = sinceStart < this.cfg.tuneInBlack * 1000 ? 1 : 0;
        const label = !this.standbyOn && sinceStart < this.cfg.labelHold * 1000 ? 1 : 0;

        const levels: CRTLevels = {noise, standby, black, label};

        const animating = standby < 0.5 && noise > 0.001;
        const changed =
            this.frameArrived ||
            noise !== this.prev.noise ||
            standby !== this.prev.standby ||
            black !== this.prev.black ||
            label !== this.prev.label;
        this.frameArrived = false;

        if (animating || changed || !this.paintedOnce) {
            this.backend.present(levels);
            this.paintedOnce = true;
            this.prev = levels;
        }
    }
}
