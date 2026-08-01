// Base class for the MPEG1 video and MP2 audio decoders. Handles the incoming
// timestamp bookkeeping and buffer plumbing shared by both.

import type {BitBuffer} from './bit-buffer.js';
import type {AudioOutput, Decoder, JSMpegOptions, Renderer} from './types.js';

interface Timestamp {
    index: number;
    time: number;
}

export abstract class BaseDecoder implements Decoder {
    /** Set by concrete subclasses in their constructor. */
    bits!: BitBuffer;
    destination: Renderer | AudioOutput | null = null;
    canPlay = false;

    collectTimestamps: boolean;
    bytesWritten = 0;
    timestamps: Timestamp[] = [];
    timestampIndex = 0;

    startTime = 0;
    decodedTime = 0;

    constructor(options: JSMpegOptions) {
        this.collectTimestamps = !options.streaming;
    }

    get currentTime(): number {
        return this.getCurrentTime();
    }

    destroy(): void {
    }

    connect(destination: Renderer | AudioOutput | null): void {
        this.destination = destination;
    }

    bufferGetIndex(): number {
        return this.bits.index;
    }

    bufferSetIndex(index: number): void {
        this.bits.index = index;
    }

    bufferWrite(buffers: Uint8Array[]): number {
        return this.bits.write(buffers);
    }

    write(pts: number, buffers: Uint8Array[]): void {
        if (this.collectTimestamps) {
            if (this.timestamps.length === 0) {
                this.startTime = pts;
                this.decodedTime = pts;
            }
            this.timestamps.push({index: this.bytesWritten << 3, time: pts});
        }

        this.bytesWritten += this.bufferWrite(buffers);
        this.canPlay = true;
    }

    seek(time: number): void {
        if (!this.collectTimestamps) {
            return;
        }

        this.timestampIndex = 0;
        for (let i = 0; i < this.timestamps.length; i++) {
            if (this.timestamps[i].time > time) {
                break;
            }
            this.timestampIndex = i;
        }

        const ts = this.timestamps[this.timestampIndex];
        if (ts) {
            this.bufferSetIndex(ts.index);
            this.decodedTime = ts.time;
        } else {
            this.bufferSetIndex(0);
            this.decodedTime = this.startTime;
        }
    }

    decode(): boolean {
        this.advanceDecodedTime(0);
        return false;
    }

    advanceDecodedTime(seconds: number): void {
        if (this.collectTimestamps) {
            let newTimestampIndex = -1;
            const currentIndex = this.bufferGetIndex();
            for (let i = this.timestampIndex; i < this.timestamps.length; i++) {
                if (this.timestamps[i].index > currentIndex) {
                    break;
                }
                newTimestampIndex = i;
            }

            // Did we find a new PTS, different from the last? If so, we don't have
            // to advance the decoded time manually and can instead sync it exactly
            // to the PTS.
            if (newTimestampIndex !== -1 && newTimestampIndex !== this.timestampIndex) {
                this.timestampIndex = newTimestampIndex;
                this.decodedTime = this.timestamps[this.timestampIndex].time;
                return;
            }
        }

        this.decodedTime += seconds;
    }

    protected getCurrentTime(): number {
        return this.decodedTime;
    }
}
