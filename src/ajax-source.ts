// Loads an entire file in one XHR request (non-streaming, non-progressive).

import type {ByteSink, JSMpegOptions, Source} from './types.js';

export class AjaxSource implements Source {
    url: string;
    destination: ByteSink | null = null;
    request: XMLHttpRequest | null = null;
    streaming = false;

    completed = false;
    established = false;
    progress = 0;

    private onEstablishedCallback?: (source: Source) => void;
    private onCompletedCallback?: (source: Source) => void;

    constructor(url: string, options: JSMpegOptions) {
        this.url = url;
        this.onEstablishedCallback = options.onSourceEstablished;
        this.onCompletedCallback = options.onSourceCompleted;
    }

    connect(destination: ByteSink): void {
        this.destination = destination;
    }

    start(): void {
        this.request = new XMLHttpRequest();

        this.request.onreadystatechange = () => {
            if (
                this.request!.readyState === this.request!.DONE &&
                this.request!.status === 200
            ) {
                this.onLoad(this.request!.response);
            }
        };

        this.request.onprogress = (ev) => this.onProgress(ev);
        this.request.open('GET', this.url);
        this.request.responseType = 'arraybuffer';
        this.request.send();
    }

    resume(_secondsHeadroom: number): void {
        // Nothing to do here
    }

    destroy(): void {
        this.request?.abort();
    }

    onProgress(ev: ProgressEvent): void {
        this.progress = ev.loaded / ev.total;
    }

    onLoad(data: ArrayBuffer): void {
        this.established = true;
        this.completed = true;
        this.progress = 1;

        if (this.onEstablishedCallback) {
            this.onEstablishedCallback(this);
        }
        if (this.onCompletedCallback) {
            this.onCompletedCallback(this);
        }

        if (this.destination) {
            this.destination.write(data);
        }
    }
}
