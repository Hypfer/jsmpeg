export declare enum BitBufferMode {
    Evict = 1,
    Expand = 2
}
type WriteInput = Uint8Array | ArrayBuffer | Array<Uint8Array | ArrayBuffer>;
export declare class BitBuffer {
    bytes: Uint8Array;
    byteLength: number;
    mode: BitBufferMode;
    index: number;
    constructor(bufferOrLength: Uint8Array | ArrayBuffer | number, mode?: BitBufferMode);
    resize(size: number): void;
    evict(sizeNeeded: number): void;
    write(buffers: WriteInput): number;
    appendSingleBuffer(buffer: Uint8Array | ArrayBuffer): void;
    findNextStartCode(): number;
    findStartCode(code: number): number;
    nextBytesAreStartCode(): boolean;
    peek(count: number): number;
    read(count: number): number;
    skip(count: number): number;
    rewind(count: number): void;
    has(count: number): boolean;
}
export {};
//# sourceMappingURL=bit-buffer.d.ts.map