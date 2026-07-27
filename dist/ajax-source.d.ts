import type { ByteSink, JSMpegOptions, Source } from './types.js';
export declare class AjaxSource implements Source {
    url: string;
    destination: ByteSink | null;
    request: XMLHttpRequest | null;
    streaming: boolean;
    completed: boolean;
    established: boolean;
    progress: number;
    private onEstablishedCallback?;
    private onCompletedCallback?;
    constructor(url: string, options: JSMpegOptions);
    connect(destination: ByteSink): void;
    start(): void;
    resume(_secondsHeadroom: number): void;
    destroy(): void;
    onProgress(ev: ProgressEvent): void;
    onLoad(data: ArrayBuffer): void;
}
//# sourceMappingURL=ajax-source.d.ts.map