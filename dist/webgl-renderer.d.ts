import type { JSMpegOptions, PlaneData, Renderer } from './types.js';
export declare class WebGLRenderer implements Renderer {
    canvas: HTMLCanvasElement;
    ownsCanvasElement: boolean;
    width: number;
    height: number;
    enabled: boolean;
    gl: WebGLRenderingContext;
    hasTextureData: Record<number, boolean>;
    shouldCreateUnclampedViews: boolean;
    vertexBuffer: WebGLBuffer;
    program: WebGLProgram;
    loadingProgram: WebGLProgram;
    textureY: WebGLTexture;
    textureCb: WebGLTexture;
    textureCr: WebGLTexture;
    private handleContextLostBound;
    private handleContextRestoredBound;
    constructor(options: JSMpegOptions);
    initGL(): void;
    handleContextLost(ev: Event): void;
    handleContextRestored(_ev: Event): void;
    destroy(): void;
    resize(width: number, height: number): void;
    createTexture(index: number, name: string): WebGLTexture;
    createProgram(vsh: string, fsh: string): WebGLProgram;
    compileShader(type: number, source: string): WebGLShader;
    allowsClampedTextureData(): boolean;
    renderProgress(progress: number): void;
    render(y: PlaneData, cb: PlaneData, cr: PlaneData, isClampedArray?: boolean): void;
    updateTexture(unit: number, texture: WebGLTexture, w: number, h: number, data: PlaneData): void;
    deleteTexture(unit: number, texture: WebGLTexture): void;
    static IsSupported(): boolean;
    static readonly SHADER: {
        FRAGMENT_YCRCB_TO_RGBA: string;
        FRAGMENT_LOADING: string;
        VERTEX_IDENTITY: string;
    };
}
//# sourceMappingURL=webgl-renderer.d.ts.map