import type { AudioOutput, JSMpegOptions } from './types.js';
type AudioContextWithConnections = AudioContext & {
    _connections?: number;
};
export declare class WebAudioOutput implements AudioOutput {
    static CachedContext: AudioContextWithConnections | null;
    context: AudioContextWithConnections;
    gain: GainNode;
    destination: AudioNode;
    startTime: number;
    buffer: AudioBuffer | null;
    wallclockStartTime: number;
    volume: number;
    enabled: boolean;
    unlocked: boolean;
    private unlockCallback;
    constructor(_options?: JSMpegOptions);
    get enqueuedTime(): number;
    destroy(): void;
    play(sampleRate: number, left: Float32Array, right: Float32Array): void;
    stop(): void;
    resetEnqueuedTime(): void;
    unlock(callback?: () => void): void;
    checkIfUnlocked(source: AudioBufferSourceNode, attempt: number): void;
    static NeedsUnlocking(): boolean;
    static IsSupported(): boolean;
}
export {};
//# sourceMappingURL=webaudio-output.d.ts.map