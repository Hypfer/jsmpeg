import {labelLayout} from './crt-compositor.js';
import type {CRTBackend, CRTLevels, ResolvedCRTOptions} from './crt-compositor.js';

const TILE_COUNT = 16;
const BAR: ReadonlyArray<readonly [number, number, number]> = [
    [191, 191, 191],
    [191, 191, 0],
    [0, 191, 191],
    [0, 191, 0],
    [191, 0, 191],
    [191, 0, 0],
    [0, 0, 191],
];

export class CRTCanvasBackend implements CRTBackend {
    private ctx: CanvasRenderingContext2D;
    private cfg: ResolvedCRTOptions;
    private width = 0;
    private height = 0;

    private videoSource: HTMLCanvasElement | null = null;

    private noiseTiles: HTMLCanvasElement[] = [];
    private tileIdx = 0;
    private snowCanvas!: HTMLCanvasElement; // phosphor accumulator
    private snowCtx!: CanvasRenderingContext2D;
    private scanCanvas!: HTMLCanvasElement;
    private labelCanvas!: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement, cfg: ResolvedCRTOptions) {
        this.cfg = cfg;
        this.ctx = canvas.getContext('2d')!;
        this.width = canvas.width;
        this.height = canvas.height;
        this.build();
    }

    private build(): void {
        const W = this.width;
        const H = this.height;

        this.noiseTiles = [];
        for (let t = 0; t < TILE_COUNT; t++) {
            this.noiseTiles.push(this.makeNoiseTile());
        }
        this.tileIdx = 0;

        this.snowCanvas = document.createElement('canvas');
        this.snowCanvas.width = W;
        this.snowCanvas.height = H;
        this.snowCtx = this.snowCanvas.getContext('2d')!;
        this.snowCtx.fillStyle = '#000';
        this.snowCtx.fillRect(0, 0, W, H);

        this.scanCanvas = document.createElement('canvas');
        this.scanCanvas.width = W;
        this.scanCanvas.height = H;
        const s = this.scanCanvas.getContext('2d')!;
        s.fillStyle = '#000';
        for (let y = 0; y < H; y += 2) {
            s.fillRect(0, y, W, 1);
        }

        this.bakeLabel(this.cfg.label);
    }

    private makeNoiseTile(): HTMLCanvasElement {
        const W = this.width;
        const H = this.height;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const cx = c.getContext('2d')!;
        const img = cx.createImageData(W, H);
        const d = img.data;
        for (let y = 0; y < H; y++) {
            const rowFlick = Math.random();
            let n = 0;
            for (let x = 0; x < W; x++) {
                if ((x & 1) === 0) {
                    n = Math.pow(Math.random(), 0.8); // 2px horizontal streak
                }
                const v = (n * 0.85 + rowFlick * 0.15) * 255;
                const i = (y * W + x) * 4;
                d[i] = d[i + 1] = d[i + 2] = v;
                d[i + 3] = 255;
            }
        }
        cx.putImageData(img, 0, 0);
        return c;
    }

    private drawTestCard(ctx: CanvasRenderingContext2D): void {
        const W = this.width;
        const H = this.height;
        const bw = W / 7;
        for (let i = 0; i < 7; i++) {
            const c = BAR[i];
            ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
            ctx.fillRect(Math.floor(i * bw), 0, Math.ceil(bw), H);
        }
        const py = Math.floor(H * 0.82);
        const pw = Math.floor(W / 8);
        for (let i = 0; i * pw < W; i++) {
            ctx.fillStyle = i % 2 ? '#1a1a1a' : '#050505';
            ctx.fillRect(i * pw, py, pw, H - py);
        }
    }

    resize(width: number, height: number): void {
        this.width = width | 0;
        this.height = height | 0;
        this.build();
    }

    bakeLabel(text: string): void {
        const c = document.createElement('canvas');
        c.width = this.width;
        c.height = this.height;
        const x = c.getContext('2d')!;
        x.clearRect(0, 0, c.width, c.height);
        x.textAlign = 'right';
        x.textBaseline = 'top';
        const lay = labelLayout(this.cfg, c.width, c.height);
        x.font = lay.font;
        x.fillStyle = '#0ad108';
        x.fillText(text, lay.x, lay.y);
        this.labelCanvas = c;
    }

    captureVideo(source: HTMLCanvasElement): void {
        // The base renderer's canvas persists between decodes, so we just hold the
        // reference and draw it at present time.
        this.videoSource = source;
    }

    present(l: CRTLevels): void {
        const ctx = this.ctx;
        const W = this.width;
        const H = this.height;
        ctx.globalAlpha = 1;

        if (l.standby >= 0.5) {
            this.drawTestCard(ctx);
        } else {
            if (this.videoSource) {
                ctx.drawImage(this.videoSource, 0, 0, W, H);
            } else {
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, W, H);
            }
            if (l.noise > 0.001) {
                // Phosphor: keep `phosphorBlend` of the previous field.
                this.snowCtx.globalAlpha = 1 - this.cfg.phosphorBlend;
                this.snowCtx.drawImage(this.noiseTiles[this.tileIdx++ % this.noiseTiles.length], 0, 0);
                this.snowCtx.globalAlpha = 1;
                // mix(video, snow, noise)
                ctx.globalAlpha = l.noise;
                ctx.drawImage(this.snowCanvas, 0, 0);
                ctx.globalAlpha = 1;
            }
        }

        if (this.cfg.scanlines > 0) {
            ctx.globalAlpha = this.cfg.scanlines;
            ctx.drawImage(this.scanCanvas, 0, 0);
            ctx.globalAlpha = 1;
        }
        if (l.black >= 0.5) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);
        }
        if (l.label >= 0.5) {
            ctx.drawImage(this.labelCanvas, 0, 0);
        }
    }

    destroy(): void {
        this.videoSource = null;
        this.noiseTiles = [];
    }
}
