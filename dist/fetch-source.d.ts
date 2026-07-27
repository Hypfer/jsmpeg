import type { ByteSink, JSMpegOptions, Source, StreamState, StreamStateListener, StreamStatus } from './types.js';
export declare class FetchSource implements Source {
    readonly url: string;
    readonly streaming = true;
    established: boolean;
    completed: boolean;
    progress: number;
    reconnectInterval: number;
    stallTimeout: number;
    private _state;
    private bytesReceived;
    private reconnectCount;
    private lastError;
    private destination;
    private abortController;
    private reader;
    private reconnectTimeoutId;
    private stallTimeoutId;
    private shouldAttemptReconnect;
    private listeners;
    private onEstablishedCallback?;
    private onCompletedCallback?;
    constructor(url: string, options: JSMpegOptions);
    get state(): StreamState;
    get status(): StreamStatus;
    /** Subscribe to state transitions. Returns an unsubscribe function. */
    addStateListener(listener: StreamStateListener): () => void;
    private setState;
    connect(destination: ByteSink): void;
    start(): void;
    resume(_secondsHeadroom: number): void;
    destroy(): void;
    private pump;
    private handleDisconnect;
    private resetStallTimer;
    private clearStallTimer;
    private static isAbortError;
}
//# sourceMappingURL=fetch-source.d.ts.map