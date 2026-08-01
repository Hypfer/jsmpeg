// Software YCbCr -> RGBA renderer using a 2D canvas. Used as a fallback when
// WebGL is unavailable (blocklisted GPUs, software rasterizers, headless).

import {fill} from './util.js';
import type {JSMpegOptions, PlaneData, Renderer} from './types.js';

export class Canvas2DRenderer implements Renderer {
    canvas: HTMLCanvasElement;
    ownsCanvasElement: boolean;
    width: number;
    height: number;
    enabled = true;
    context: CanvasRenderingContext2D;
    imageData!: ImageData;

    constructor(options: JSMpegOptions) {
        if (options.canvas) {
            this.canvas = options.canvas;
            this.ownsCanvasElement = false;
        } else {
            this.canvas = document.createElement('canvas');
            this.ownsCanvasElement = true;
        }
        this.width = this.canvas.width;
        this.height = this.canvas.height;

        this.context = this.canvas.getContext('2d')!;
    }

    destroy(): void {
        if (this.ownsCanvasElement) {
            this.canvas.remove();
        }
    }

    resize(width: number, height: number): void {
        this.width = width | 0;
        this.height = height | 0;

        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.imageData = this.context.getImageData(0, 0, this.width, this.height);
        fill(this.imageData.data, 255);
    }

    renderProgress(progress: number): void {
        const w = this.canvas.width,
            h = this.canvas.height,
            ctx = this.context;

        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, h - h * progress, w, h * progress);
    }

    render(y: PlaneData, cb: PlaneData, cr: PlaneData): void {
        this.YCbCrToRGBA(y, cb, cr, this.imageData.data);
        this.context.putImageData(this.imageData, 0, 0);
    }

    YCbCrToRGBA(y: PlaneData, cb: PlaneData, cr: PlaneData, rgba: Uint8ClampedArray): void {
        if (!this.enabled) {
            return;
        }

        // Chroma values are the same for each block of 4 pixels, so we proccess
        // 2 lines at a time, 2 neighboring pixels each.
        // I wish we could use 32bit writes to the RGBA buffer instead of writing
        // each byte separately, but we need the automatic clamping of the RGBA
        // buffer.

        const w = ((this.width + 15) >> 4) << 4,
            w2 = w >> 1;

        let yIndex1 = 0,
            yIndex2 = w;
        const yNext2Lines = w + (w - this.width);

        let cIndex = 0;
        const cNextLine = w2 - (this.width >> 1);

        let rgbaIndex1 = 0,
            rgbaIndex2 = this.width * 4;
        const rgbaNext2Lines = this.width * 4;

        const cols = this.width >> 1,
            rows = this.height >> 1;

        let ccb: number, ccr: number, r: number, g: number, b: number;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                ccb = cb[cIndex];
                ccr = cr[cIndex];
                cIndex++;

                r = ccb + ((ccb * 103) >> 8) - 179;
                g = ((ccr * 88) >> 8) - 44 + ((ccb * 183) >> 8) - 91;
                b = ccr + ((ccr * 198) >> 8) - 227;

                // Line 1
                const y1 = y[yIndex1++];
                const y2 = y[yIndex1++];
                rgba[rgbaIndex1] = y1 + r;
                rgba[rgbaIndex1 + 1] = y1 - g;
                rgba[rgbaIndex1 + 2] = y1 + b;
                rgba[rgbaIndex1 + 4] = y2 + r;
                rgba[rgbaIndex1 + 5] = y2 - g;
                rgba[rgbaIndex1 + 6] = y2 + b;
                rgbaIndex1 += 8;

                // Line 2
                const y3 = y[yIndex2++];
                const y4 = y[yIndex2++];
                rgba[rgbaIndex2] = y3 + r;
                rgba[rgbaIndex2 + 1] = y3 - g;
                rgba[rgbaIndex2 + 2] = y3 + b;
                rgba[rgbaIndex2 + 4] = y4 + r;
                rgba[rgbaIndex2 + 5] = y4 - g;
                rgba[rgbaIndex2 + 6] = y4 + b;
                rgbaIndex2 += 8;
            }

            yIndex1 += yNext2Lines;
            yIndex2 += yNext2Lines;
            rgbaIndex1 += rgbaNext2Lines;
            rgbaIndex2 += rgbaNext2Lines;
            cIndex += cNextLine;
        }
    }
}
