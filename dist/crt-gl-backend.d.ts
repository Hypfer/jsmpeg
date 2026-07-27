import type { CRTBackend, CRTLevels, ResolvedCRTOptions } from './crt-compositor.js';
export declare class CRTGLBackend implements CRTBackend {
    private gl;
    private cfg;
    private width;
    private height;
    private quad;
    private noiseProg;
    private compProg;
    private noiseLoc;
    private compLoc;
    private snowA;
    private snowB;
    private videoTex;
    private labelTex;
    private seed;
    private labelText;
    private handleLostBound;
    private handleRestoredBound;
    constructor(canvas: HTMLCanvasElement, cfg: ResolvedCRTOptions, options: {
        preserveDrawingBuffer?: boolean;
    });
    private initGL;
    private program;
    private compile;
    private locations;
    private makeTex;
    private makeFBO;
    private bindQuad;
    resize(width: number, height: number): void;
    bakeLabel(text: string): void;
    captureVideo(source: HTMLCanvasElement): void;
    present(l: CRTLevels): void;
    destroy(): void;
}
//# sourceMappingURL=crt-gl-backend.d.ts.map