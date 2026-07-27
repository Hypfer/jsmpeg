import type { BitBuffer } from './bit-buffer.js';
import type { AudioOutput, Decoder, JSMpegOptions, Renderer } from './types.js';
interface Timestamp {
    index: number;
    time: number;
}
export declare abstract class BaseDecoder implements Decoder {
    /** Set by concrete subclasses in their constructor. */
    bits: BitBuffer;
    destination: Renderer | AudioOutput | null;
    canPlay: boolean;
    collectTimestamps: boolean;
    bytesWritten: number;
    timestamps: Timestamp[];
    timestampIndex: number;
    startTime: number;
    decodedTime: number;
    constructor(options: JSMpegOptions);
    get currentTime(): number;
    destroy(): void;
    connect(destination: Renderer | AudioOutput | null): void;
    bufferGetIndex(): number;
    bufferSetIndex(index: number): void;
    bufferWrite(buffers: Uint8Array[]): number;
    write(pts: number, buffers: Uint8Array[]): void;
    seek(time: number): void;
    decode(): boolean;
    advanceDecodedTime(seconds: number): void;
    protected getCurrentTime(): number;
}
export {};
//# sourceMappingURL=decoder-base.d.ts.map