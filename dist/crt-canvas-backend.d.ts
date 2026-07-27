import type { CRTBackend, CRTLevels, ResolvedCRTOptions } from './crt-compositor.js';
export declare class CRTCanvasBackend implements CRTBackend {
    private ctx;
    private cfg;
    private width;
    private height;
    private videoSource;
    private noiseTiles;
    private tileIdx;
    private snowCanvas;
    private snowCtx;
    private scanCanvas;
    private labelCanvas;
    constructor(canvas: HTMLCanvasElement, cfg: ResolvedCRTOptions);
    private build;
    private makeNoiseTile;
    private drawTestCard;
    resize(width: number, height: number): void;
    bakeLabel(text: string): void;
    captureVideo(source: HTMLCanvasElement): void;
    present(l: CRTLevels): void;
    destroy(): void;
}
//# sourceMappingURL=crt-canvas-backend.d.ts.map