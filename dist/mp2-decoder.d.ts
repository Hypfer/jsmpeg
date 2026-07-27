import { BaseDecoder } from './decoder-base.js';
import type { AudioDecoder, JSMpegOptions } from './types.js';
interface QuantTabEntry {
    levels: number;
    group: number;
    bits: number;
}
export declare class MP2Audio extends BaseDecoder implements AudioDecoder {
    onDecodeCallback?: (decoder: AudioDecoder, elapsedTime: number) => void;
    left: Float32Array;
    right: Float32Array;
    sampleRate: number;
    D: Float32Array;
    V: [Float32Array, Float32Array];
    U: Int32Array;
    VPos: number;
    allocation: [Array<QuantTabEntry | 0>, Array<QuantTabEntry | 0>];
    scaleFactorInfo: [Uint8Array, Uint8Array];
    scaleFactor: [number[][], number[][]];
    sample: [number[][], number[][]];
    constructor(options: JSMpegOptions);
    decode(): boolean;
    protected getCurrentTime(): number;
    decodeFrame(left: Float32Array, right: Float32Array): number;
    readAllocation(sb: number, tab3: number): QuantTabEntry | 0;
    readSamples(ch: number, sb: number, part: number): void;
    static MatrixTransform(s: number[][], ss: number, d: Float32Array, dp: number): void;
    static readonly FRAME_SYNC = 2047;
    static readonly VERSION: {
        readonly MPEG_2_5: 0;
        readonly MPEG_2: 2;
        readonly MPEG_1: 3;
    };
    static readonly LAYER: {
        readonly III: 1;
        readonly II: 2;
        readonly I: 3;
    };
    static readonly MODE: {
        readonly STEREO: 0;
        readonly JOINT_STEREO: 1;
        readonly DUAL_CHANNEL: 2;
        readonly MONO: 3;
    };
    static readonly SAMPLE_RATE: Uint16Array<ArrayBuffer>;
    static readonly BIT_RATE: Uint16Array<ArrayBuffer>;
    static readonly SCALEFACTOR_BASE: Uint32Array<ArrayBuffer>;
    static readonly SYNTHESIS_WINDOW: Float32Array<ArrayBuffer>;
    static readonly QUANT_LUT_STEP_1: number[][];
    static readonly QUANT_TAB_ID: {
        readonly A: number;
        readonly B: number;
        readonly C: 8;
        readonly D: 12;
    };
    static readonly QUANT_LUT_STEP_2: number[][];
    static readonly QUANT_LUT_STEP_3: number[][];
    static readonly QUANT_LUT_STEP4: number[][];
    static readonly QUANT_TAB: QuantTabEntry[];
}
export {};
//# sourceMappingURL=mp2-decoder.d.ts.map