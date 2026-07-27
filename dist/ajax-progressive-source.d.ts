import type { ByteSink, JSMpegOptions, Source } from './types.js';
export declare class AjaxProgressiveSource implements Source {
    url: string;
    destination: ByteSink | null;
    request: XMLHttpRequest | null;
    streaming: boolean;
    completed: boolean;
    established: boolean;
    progress: number;
    fileSize: number;
    loadedSize: number;
    chunkSize: number;
    isLoading: boolean;
    loadStartTime: number;
    loadTime: number;
    loadFails: number;
    throttled: boolean;
    aborted: boolean;
    private onEstablishedCallback?;
    private onCompletedCallback?;
    constructor(url: string, options: JSMpegOptions);
    connect(destination: ByteSink): void;
    start(): void;
    resume(secondsHeadroom: number): void;
    destroy(): void;
    loadNextChunk(): void;
    onProgress(ev: ProgressEvent): void;
    onChunkLoad(data: ArrayBuffer): void;
}
//# sourceMappingURL=ajax-progressive-source.d.ts.map