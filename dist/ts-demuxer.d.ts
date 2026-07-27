import { BitBuffer } from './bit-buffer.js';
import type { Decoder, Demuxer } from './types.js';
export declare const TS_STREAM: {
    readonly PACK_HEADER: 186;
    readonly SYSTEM_HEADER: 187;
    readonly PROGRAM_MAP: 188;
    readonly PRIVATE_1: 189;
    readonly PADDING: 190;
    readonly PRIVATE_2: 191;
    readonly AUDIO_1: 192;
    readonly VIDEO_1: 224;
    readonly DIRECTORY: 255;
};
interface PESPacketInfo {
    destination: Decoder;
    currentLength: number;
    totalLength: number;
    pts: number;
    buffers: Uint8Array[];
}
export declare class TSDemuxer implements Demuxer {
    static readonly STREAM: {
        readonly PACK_HEADER: 186;
        readonly SYSTEM_HEADER: 187;
        readonly PROGRAM_MAP: 188;
        readonly PRIVATE_1: 189;
        readonly PADDING: 190;
        readonly PRIVATE_2: 191;
        readonly AUDIO_1: 192;
        readonly VIDEO_1: 224;
        readonly DIRECTORY: 255;
    };
    bits: BitBuffer | null;
    leftoverBytes: Uint8Array | null;
    guessVideoFrameEnd: boolean;
    pidsToStreamIds: Record<number, number>;
    pesPacketInfo: Record<number, PESPacketInfo>;
    startTime: number;
    currentTime: number;
    constructor(_options?: unknown);
    connect(streamId: number, destination: Decoder): void;
    write(buffer: ArrayBuffer | Uint8Array): void;
    parsePacket(): boolean;
    resync(): boolean;
    packetStart(pi: PESPacketInfo, pts: number, payloadLength: number): void;
    packetAddData(pi: PESPacketInfo, start: number, end: number): boolean;
    packetComplete(pi: PESPacketInfo): void;
}
export {};
//# sourceMappingURL=ts-demuxer.d.ts.map