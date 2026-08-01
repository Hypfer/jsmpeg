// Shared structural interfaces for the decode pipeline:
//   Source -> Demuxer -> Decoder -> Renderer / AudioOutput
//
// These describe the same contracts the original jsmpeg documented as prose on
// the `JSMpeg` namespace object, now expressed as TypeScript interfaces so the
// pipeline nodes can be wired together type-safely.

export type PlaneData = Uint8Array | Uint8ClampedArray;

/**
 * Lifecycle of a live streaming source.
 *
 *   idle → connecting → streaming ⇄ stalled
 *                          ↘ reconnecting → connecting → …
 *   (terminal) closed | error
 */
export type StreamState =
    | 'idle' // constructed, not started
    | 'connecting' // request in flight, no bytes yet
    | 'streaming' // receiving data
    | 'stalled' // connected but no data within stallTimeout (opt-in)
    | 'reconnecting' // dropped, waiting to retry
    | 'closed' // ended cleanly / destroyed, no reconnect
    | 'error'; // failed with no reconnect

/** Immutable snapshot of a streaming source's state, handed to listeners. */
export interface StreamStatus {
    state: StreamState;
    /** Total bytes received across the current connection attempt's lifetime. */
    bytesReceived: number;
    /** Number of reconnect attempts since start(). */
    reconnectCount: number;
    /** The error that caused the last drop, if any. */
    lastError: unknown;
}

export type StreamStateListener = (status: StreamStatus) => void;

/** Anything a Source can hand raw bytes to (i.e. a Demuxer). */
export interface ByteSink {
    write(buffer: ArrayBuffer | Uint8Array): void;
}

/**
 * A Source provides raw data from HTTP, a WebSocket connection or any other
 * means.
 */
export interface Source {
    connect(destination: ByteSink): void;

    start(): void;

    /** Continue reading; `secondsHeadroom` is the distance to the play head. */
    resume(secondsHeadroom: number): void;

    destroy?(): void;

    /** True after the connection is established. */
    established: boolean;
    /** True once the source is completely loaded. */
    completed: boolean;
    /** Load progress, 0..1. */
    progress: number;
    /** True for live/streaming sources. */
    streaming: boolean;
}

/**
 * A Renderer accepts raw YCbCr data in 3 separate buffers and typically draws
 * it to a canvas.
 */
export interface Renderer {
    /** Whether the renderer does anything upon receiving data. */
    enabled: boolean;

    render(y: PlaneData, cb: PlaneData, cr: PlaneData, isClampedArray?: boolean): void;

    renderProgress(progress: number): void;

    resize(width: number, height: number): void;

    destroy(): void;
}

/**
 * Optional Renderer capability: a renderer that wants the source's connection
 * state fed to it. The Player calls this on every stream transition if the
 * active renderer implements it (duck-typed — the core stays agnostic about
 * which renderer it is).
 */
export interface StreamStateSink {
    setStreamState(state: StreamState): void;
}

/** Builds the Renderer the Player will drive; see JSMpegOptions.createRenderer. */
export type RendererFactory = (options: JSMpegOptions) => Renderer;

/**
 * An Audio Output accepts raw stereo PCM data in 2 separate buffers and
 * typically plays it on the user's device.
 */
export interface AudioOutput {
    /** Whether the output does anything upon receiving data. */
    enabled: boolean;
    volume: number;
    unlocked: boolean;
    /** Seconds of audio currently enqueued ahead of the play head. */
    readonly enqueuedTime: number;

    play(sampleRate: number, left: Float32Array, right: Float32Array): void;

    stop(): void;

    resetEnqueuedTime(): void;

    unlock(callback?: () => void): void;

    destroy(): void;
}

/** A Decoder accepts an incoming stream of raw audio or video data. */
export interface Decoder {
    connect(destination: Renderer | AudioOutput | null): void;

    write(pts: number, buffers: Uint8Array[]): void;

    /** Decode a single frame; returns false when there's not enough data. */
    decode(): boolean;

    seek(time: number): void;

    destroy(): void;

    readonly currentTime: number;
    startTime: number;
    decodedTime: number;
    canPlay: boolean;
}

export interface VideoDecoder extends Decoder {
    connect(destination: Renderer | null): void;

    frameRate: number;
    width: number;
    height: number;
}

export interface AudioDecoder extends Decoder {
    connect(destination: AudioOutput | null): void;

    sampleRate: number;
}

/** A Demuxer separates incoming raw data into video, audio and other streams. */
export interface Demuxer extends ByteSink {
    connect(streamId: number, destination: Decoder): void;

    currentTime: number;
    startTime: number;
}

/** Construct signature shared by all Source implementations. */
export interface SourceConstructor {
    new(url: string, options: JSMpegOptions): Source;
}

/**
 * Options accepted by the Player and the individual pipeline nodes. Every field
 * is optional; unknown extra fields are permitted (VideoElement forwards parsed
 * `data-*` attributes verbatim).
 */
export interface JSMpegOptions {
    // Source selection / transport
    source?: SourceConstructor;
    streaming?: boolean;
    progressive?: boolean;
    chunkSize?: number;
    throttled?: boolean;
    reconnectInterval?: number;
    protocols?: string | string[];

    /**
     * FetchSource: seconds without data (while connected) before the source
     * reports the `stalled` state. 0 (default) disables stall detection.
     */
    stallTimeout?: number;
    /** FetchSource: called on every stream state transition. */
    onStreamStateChange?: (status: StreamStatus) => void;

    // Playback behaviour
    autoplay?: boolean;
    loop?: boolean;
    maxAudioLag?: number;
    pauseWhenHidden?: boolean;
    decodeFirstFrame?: boolean;

    // Pipeline toggles
    video?: boolean;
    audio?: boolean;
    disableGl?: boolean;

    // Rendering surface
    canvas?: HTMLCanvasElement;
    preserveDrawingBuffer?: boolean;

    /**
     * Supply your own Renderer instead of the built-in WebGL/Canvas2D selection
     * (e.g. the CRTCompositor, or any custom effect). Absent ⇒ the plain base
     * renderer paints straight to the canvas, with zero post-processing
     * (identical to stock jsmpeg). The factory receives these same options.
     * A returned renderer that implements `StreamStateSink` is automatically
     * fed the source's connection state.
     */
    createRenderer?: RendererFactory;

    /**
     * Video dimensions known in advance (e.g. the camera resolution, or a server
     * `X-Video-Width/Height` header). Lets a renderer lay out and allocate from
     * frame zero, before the MPEG1 sequence header arrives. The sequence header
     * stays authoritative and reconciles via the decoder's `resize()`.
     */
    videoWidth?: number;
    videoHeight?: number;

    // Decoder buffers
    videoBufferSize?: number;
    audioBufferSize?: number;

    // Poster (VideoElement only)
    poster?: string;

    // Callbacks
    onPlay?: (player: unknown) => void;
    onPause?: (player: unknown) => void;
    onEnded?: (player: unknown) => void;
    onStalled?: (player: unknown) => void;
    onVideoDecode?: (decoder: VideoDecoder, elapsedTime: number) => void;
    onAudioDecode?: (decoder: AudioDecoder, elapsedTime: number) => void;
    onSourceEstablished?: (source: Source) => void;
    onSourceCompleted?: (source: Source) => void;

    // VideoElement forwards arbitrary parsed data-* attributes.
    [key: string]: unknown;
}
