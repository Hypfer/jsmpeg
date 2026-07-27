import { Canvas2DRenderer } from './canvas2d-renderer.js';
import { CRTCanvasBackend } from './crt-canvas-backend.js';
import { CRTGLBackend } from './crt-gl-backend.js';
import { WebGLRenderer } from './webgl-renderer.js';
export function labelLayout(cfg, width, height) {
    const fontPx = Math.max(8, Math.round(height * cfg.labelScale));
    const margin = Math.round(fontPx * 0.7);
    return { font: `bold ${fontPx}px 'Courier New', monospace`, x: width - margin, y: margin };
}
function resolveCRTOptions(config) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const o = config !== null && config !== void 0 ? config : {};
    return {
        deadband: (_a = o.deadband) !== null && _a !== void 0 ? _a : 0.05,
        ramp: (_b = o.ramp) !== null && _b !== void 0 ? _b : 1.2,
        phosphorBlend: (_c = o.phosphorBlend) !== null && _c !== void 0 ? _c : 0.2,
        snowHold: (_d = o.snowHold) !== null && _d !== void 0 ? _d : 0.2,
        tuneInBlack: (_e = o.tuneInBlack) !== null && _e !== void 0 ? _e : 0.5,
        labelHold: (_f = o.labelHold) !== null && _f !== void 0 ? _f : 2,
        scanlines: (_g = o.scanlines) !== null && _g !== void 0 ? _g : 0.12,
        label: (_h = o.label) !== null && _h !== void 0 ? _h : 'VIDEO 1',
        labelScale: (_j = o.labelScale) !== null && _j !== void 0 ? _j : 0.06,
        lostTimeout: (_k = o.lostTimeout) !== null && _k !== void 0 ? _k : 4,
    };
}
function smoothstep(a, b, x) {
    if (b <= a) {
        return x < a ? 0 : 1;
    }
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}
export class CRTCompositor {
    constructor(options, config) {
        this.enabled = true;
        // Snow progress 0..1, eased both ways at the `ramp` rate (rises while frames
        // are absent, falls as they resume). Displayed noise is a smoothstep of this.
        this.noiseP = 0;
        this.frameArrived = false;
        this.everConnected = false;
        this.standbyOn = false;
        this.saturatedSince = null;
        this.wasLive = false;
        // Starts true so the first acquire also plays the tune-in: a cold start
        // counts as coming from "no signal".
        this.sawStandby = true;
        this.channelStartAt = -1e12;
        // Optional real connection state: tells a quiet-but-connected stall (stays on
        // snow) from a genuine drop (cuts to the test card).
        this.streamStateWired = false;
        this.streamConnected = true;
        // present-loop paint gate: skip redundant static repaints
        this.animationId = null;
        this.paintedOnce = false;
        this.prev = { noise: -1, standby: -1, black: -1, label: -1 };
        this.cfg = resolveCRTOptions(config);
        if (options.canvas) {
            this.canvas = options.canvas;
            this.ownsCanvasElement = false;
        }
        else {
            this.canvas = document.createElement('canvas');
            this.ownsCanvasElement = true;
        }
        // Dimensions known in advance (options) win, else fall back to the canvas
        // size. The MPEG1 sequence header reconciles later via resize().
        this.width = (options.videoWidth || this.canvas.width || 0) | 0;
        this.height = (options.videoHeight || this.canvas.height || 0) | 0;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        // Offscreen surface for the base renderer.
        this.videoCanvas = document.createElement('canvas');
        this.videoCanvas.width = this.width;
        this.videoCanvas.height = this.height;
        const useGl = !options.disableGl && WebGLRenderer.IsSupported();
        const baseOptions = {
            ...options,
            canvas: this.videoCanvas,
            createRenderer: undefined,
            preserveDrawingBuffer: true,
        };
        this.base = useGl ? new WebGLRenderer(baseOptions) : new Canvas2DRenderer(baseOptions);
        this.base.resize(this.width, this.height);
        this.backend = useGl
            ? new CRTGLBackend(this.canvas, this.cfg, { preserveDrawingBuffer: false })
            : new CRTCanvasBackend(this.canvas, this.cfg);
        this.lastFrameAt = performance.now();
        this.lastTickAt = this.lastFrameAt;
        this.tickBound = (now) => this.tick(now);
        this.visibilityBound = () => this.onVisibility();
        document.addEventListener('visibilitychange', this.visibilityBound);
        this.animationId = requestAnimationFrame(this.tickBound);
    }
    render(y, cb, cr, isClampedArray) {
        if (!this.enabled) {
            return;
        }
        this.base.render(y, cb, cr, isClampedArray);
        this.backend.captureVideo(this.videoCanvas);
        this.frameArrived = true;
        this.lastFrameAt = performance.now();
        this.everConnected = true;
    }
    renderProgress(_progress) {
        // Before the source is established the present loop already shows the test
        // card (everConnected === false); nothing to draw here.
    }
    resize(width, height) {
        this.width = width | 0;
        this.height = height | 0;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.videoCanvas.width = this.width;
        this.videoCanvas.height = this.height;
        this.base.resize(this.width, this.height);
        this.backend.resize(this.width, this.height);
        // Force a repaint at the new size.
        this.prev = { noise: -1, standby: -1, black: -1, label: -1 };
        this.paintedOnce = false;
    }
    destroy() {
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
    setStreamState(state) {
        this.streamStateWired = true;
        this.streamConnected =
            state === 'streaming' || state === 'stalled' || state === 'connecting';
    }
    setLabel(text) {
        this.cfg.label = text;
        this.backend.bakeLabel(text);
    }
    onVisibility() {
        if (document.visibilityState === 'visible') {
            const t = performance.now();
            this.lastFrameAt = t;
            this.lastTickAt = t;
        }
    }
    tick(now) {
        this.animationId = requestAnimationFrame(this.tickBound);
        const dt = Math.min((now - this.lastTickAt) / 1000, 0.1);
        this.lastTickAt = now;
        const sinceFrame = (now - this.lastFrameAt) / 1000;
        const target = sinceFrame > this.cfg.deadband ? 1 : 0;
        const step = this.cfg.ramp > 0 ? dt / this.cfg.ramp : 1;
        if (this.standbyOn && target === 0) {
            this.noiseP = 0;
        }
        else {
            this.noiseP = Math.max(0, Math.min(1, this.noiseP + (target === 1 ? step : -step)));
        }
        const noise = smoothstep(0, 1, this.noiseP);
        const lost = this.streamStateWired ? !this.streamConnected : sinceFrame > this.cfg.lostTimeout;
        if (!this.everConnected) {
            this.standbyOn = true;
        }
        else if (lost && noise >= 0.98) {
            if (this.saturatedSince === null) {
                this.saturatedSince = now;
            }
            this.standbyOn = (now - this.saturatedSince) / 1000 >= this.cfg.snowHold;
        }
        else {
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
        const levels = { noise, standby, black, label };
        const animating = standby < 0.5 && noise > 0.001;
        const changed = this.frameArrived ||
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
//# sourceMappingURL=crt-compositor.js.map