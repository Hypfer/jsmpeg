// The BitBuffer wraps a Uint8Array and allows reading an arbitrary number of
// bits at a time. On writing, the BitBuffer either expands its internal buffer
// (for static files) or deletes old data (for streaming).

export enum BitBufferMode {
    Evict = 1,
    Expand = 2,
}

type WriteInput = Uint8Array | ArrayBuffer | Array<Uint8Array | ArrayBuffer>;

export class BitBuffer {
    bytes: Uint8Array;
    byteLength: number;
    mode: BitBufferMode;
    index: number;

    constructor(bufferOrLength: Uint8Array | ArrayBuffer | number, mode?: BitBufferMode) {
        if (typeof bufferOrLength === 'object') {
            this.bytes =
                bufferOrLength instanceof Uint8Array
                    ? bufferOrLength
                    : new Uint8Array(bufferOrLength);

            this.byteLength = this.bytes.length;
        } else {
            this.bytes = new Uint8Array(bufferOrLength || 1024 * 1024);
            this.byteLength = 0;
        }

        this.mode = mode || BitBufferMode.Expand;
        this.index = 0;
    }

    resize(size: number): void {
        const newBytes = new Uint8Array(size);
        if (this.byteLength !== 0) {
            this.byteLength = Math.min(this.byteLength, size);
            newBytes.set(this.bytes.subarray(0, this.byteLength));
        }
        this.bytes = newBytes;
        this.index = Math.min(this.index, this.byteLength << 3);
    }

    evict(sizeNeeded: number): void {
        const bytePos = this.index >> 3;
        const available = this.bytes.length - this.byteLength;

        // If the current index is the write position, we can simply reset both
        // to 0. Also reset (and throw away yet unread data) if we won't be able
        // to fit the new data in even after a normal eviction.
        if (this.index === this.byteLength << 3 || sizeNeeded > available + bytePos) {
            this.byteLength = 0;
            this.index = 0;
            return;
        } else if (bytePos === 0) {
            // Nothing read yet - we can't evict anything
            return;
        }

        // Some browsers don't support copyWithin() yet - we may have to do
        // it manually using set and a subarray
        if (this.bytes.copyWithin) {
            this.bytes.copyWithin(0, bytePos, this.byteLength);
        } else {
            this.bytes.set(this.bytes.subarray(bytePos, this.byteLength));
        }

        this.byteLength = this.byteLength - bytePos;
        this.index -= bytePos << 3;
    }

    write(buffers: WriteInput): number {
        const isArrayOfBuffers = typeof (buffers as { [index: number]: unknown })[0] === 'object';
        let totalLength = 0;
        const available = this.bytes.length - this.byteLength;

        // Calculate total byte length
        if (isArrayOfBuffers) {
            const list = buffers as Array<Uint8Array | ArrayBuffer>;
            totalLength = 0;
            for (let i = 0; i < list.length; i++) {
                totalLength += list[i].byteLength;
            }
        } else {
            totalLength = (buffers as Uint8Array | ArrayBuffer).byteLength;
        }

        // Do we need to resize or evict?
        if (totalLength > available) {
            if (this.mode === BitBufferMode.Expand) {
                const newSize = Math.max(this.bytes.length * 2, totalLength - available);
                this.resize(newSize);
            } else {
                this.evict(totalLength);
            }
        }

        if (isArrayOfBuffers) {
            const list = buffers as Array<Uint8Array | ArrayBuffer>;
            for (let i = 0; i < list.length; i++) {
                this.appendSingleBuffer(list[i]);
            }
        } else {
            this.appendSingleBuffer(buffers as Uint8Array | ArrayBuffer);
        }

        return totalLength;
    }

    appendSingleBuffer(buffer: Uint8Array | ArrayBuffer): void {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

        this.bytes.set(bytes, this.byteLength);
        this.byteLength += bytes.length;
    }

    findNextStartCode(): number {
        for (let i = (this.index + 7) >> 3; i < this.byteLength; i++) {
            if (
                this.bytes[i] === 0x00 &&
                this.bytes[i + 1] === 0x00 &&
                this.bytes[i + 2] === 0x01
            ) {
                this.index = (i + 4) << 3;
                return this.bytes[i + 3];
            }
        }
        this.index = this.byteLength << 3;
        return -1;
    }

    findStartCode(code: number): number {
        let current = 0;
        while (true) {
            current = this.findNextStartCode();
            if (current === code || current === -1) {
                return current;
            }
        }
    }

    nextBytesAreStartCode(): boolean {
        const i = (this.index + 7) >> 3;
        return (
            i >= this.byteLength ||
            (this.bytes[i] === 0x00 && this.bytes[i + 1] === 0x00 && this.bytes[i + 2] === 0x01)
        );
    }

    peek(count: number): number {
        let offset = this.index;
        let value = 0;
        while (count) {
            const currentByte = this.bytes[offset >> 3];
            const remaining = 8 - (offset & 7); // remaining bits in byte
            const read = remaining < count ? remaining : count; // bits in this run
            const shift = remaining - read;
            const mask = 0xff >> (8 - read);

            value = (value << read) | ((currentByte & (mask << shift)) >> shift);

            offset += read;
            count -= read;
        }

        return value;
    }

    read(count: number): number {
        const value = this.peek(count);
        this.index += count;
        return value;
    }

    skip(count: number): number {
        return (this.index += count);
    }

    rewind(count: number): void {
        this.index = Math.max(this.index - count, 0);
    }

    has(count: number): boolean {
        return (this.byteLength << 3) - this.index >= count;
    }
}
