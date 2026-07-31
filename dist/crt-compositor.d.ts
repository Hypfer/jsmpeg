import type { JSMpegOptions, PlaneData, Renderer, StreamState, StreamStateSink } from './types.js';
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
export declare function labelLayout(cfg: ResolvedCRTOptions, width: number, height: number): {
    font: string;
    x: number;
    y: number;
};
export interface CRTLevels {
    noise: number;
    standby: number;
    black: number;
    label: number;
}
export interface CRTBackend {
    resize(width: number, height: number): void;
    bakeLabel(text: string): void;
    captureVideo(source: HTMLCanvasElement): void;
    present(levels: CRTLevels): void;
    destroy(): void;
}
export declare class CRTCompositor implements Renderer, StreamStateSink {
    enabled: boolean;
    readonly canvas: HTMLCanvasElement;
    private ownsCanvasElement;
    private base;
    private videoCanvas;
    private backend;
    private cfg;
    private width;
    private height;
    private lastFrameAt;
    private lastTickAt;
    private noiseP;
    private frameArrived;
    private everConnected;
    private standbyOn;
    private saturatedSince;
    private wasLive;
    private sawStandby;
    private channelStartAt;
    private streamStateWired;
    private streamConnected;
    private animationId;
    private paintedOnce;
    private prev;
    private tickBound;
    private visibilityBound;
    private destroyed;
    constructor(options: JSMpegOptions, config?: CRTOptions);
    render(y: PlaneData, cb: PlaneData, cr: PlaneData, isClampedArray?: boolean): void;
    renderProgress(_progress: number): void;
    resize(width: number, height: number): void;
    destroy(): void;
    setStreamState(state: StreamState): void;
    setLabel(text: string): void;
    private onVisibility;
    private tick;
}
//# sourceMappingURL=crt-compositor.d.ts.map