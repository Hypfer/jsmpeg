// Loads an entire file in one XHR request (non-streaming, non-progressive).
export class AjaxSource {
    constructor(url, options) {
        this.destination = null;
        this.request = null;
        this.streaming = false;
        this.completed = false;
        this.established = false;
        this.progress = 0;
        this.url = url;
        this.onEstablishedCallback = options.onSourceEstablished;
        this.onCompletedCallback = options.onSourceCompleted;
    }
    connect(destination) {
        this.destination = destination;
    }
    start() {
        this.request = new XMLHttpRequest();
        this.request.onreadystatechange = () => {
            if (this.request.readyState === this.request.DONE &&
                this.request.status === 200) {
                this.onLoad(this.request.response);
            }
        };
        this.request.onprogress = (ev) => this.onProgress(ev);
        this.request.open('GET', this.url);
        this.request.responseType = 'arraybuffer';
        this.request.send();
    }
    resume(_secondsHeadroom) {
        // Nothing to do here
    }
    destroy() {
        var _a;
        (_a = this.request) === null || _a === void 0 ? void 0 : _a.abort();
    }
    onProgress(ev) {
        this.progress = ev.loaded / ev.total;
    }
    onLoad(data) {
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
//# sourceMappingURL=ajax-source.js.map