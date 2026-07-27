import type { JSMpegOptions, PlaneData, Renderer } from './types.js';
export declare class Canvas2DRenderer implements Renderer {
    canvas: HTMLCanvasElement;
    ownsCanvasElement: boolean;
    width: number;
    height: number;
    enabled: boolean;
    context: CanvasRenderingContext2D;
    imageData: ImageData;
    constructor(options: JSMpegOptions);
    destroy(): void;
    resize(width: number, height: number): void;
    renderProgress(progress: number): void;
    render(y: PlaneData, cb: PlaneData, cr: PlaneData): void;
    YCbCrToRGBA(y: PlaneData, cb: PlaneData, cr: PlaneData, rgba: Uint8ClampedArray): void;
}
//# sourceMappingURL=canvas2d-renderer.d.ts.map