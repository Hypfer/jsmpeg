import type { ByteSink, JSMpegOptions, Source } from './types.js';
export declare class WebSocketSource implements Source {
    url: string;
    options: JSMpegOptions;
    socket: WebSocket | null;
    streaming: boolean;
    callbacks: {
        connect: Array<() => void>;
        data: Array<() => void>;
    };
    destination: ByteSink | null;
    reconnectInterval: number;
    shouldAttemptReconnect: boolean;
    completed: boolean;
    established: boolean;
    progress: number;
    reconnectTimeoutId: ReturnType<typeof setTimeout> | 0;
    private onEstablishedCallback?;
    private onCompletedCallback?;
    constructor(url: string, options: JSMpegOptions);
    connect(destination: ByteSink): void;
    destroy(): void;
    start(): void;
    resume(_secondsHeadroom: number): void;
    onOpen(): void;
    onClose(): void;
    onMessage(ev: MessageEvent): void;
}
//# sourceMappingURL=websocket-source.d.ts.map