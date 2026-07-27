// WebSocket streaming source. Kept for completeness; note that WebSocket
// upgrades often don't survive reverse proxies / ingress, which is why the
// progressive HTTP source is preferred for proxied deployments.
export class WebSocketSource {
    constructor(url, options) {
        this.socket = null;
        this.streaming = true;
        this.callbacks = { connect: [], data: [] };
        this.destination = null;
        this.completed = false;
        this.established = false;
        this.progress = 0;
        this.reconnectTimeoutId = 0;
        this.url = url;
        this.options = options;
        this.reconnectInterval =
            options.reconnectInterval !== undefined ? options.reconnectInterval : 5;
        this.shouldAttemptReconnect = !!this.reconnectInterval;
        this.onEstablishedCallback = options.onSourceEstablished;
        this.onCompletedCallback = options.onSourceCompleted; // Never used
    }
    connect(destination) {
        this.destination = destination;
    }
    destroy() {
        var _a;
        clearTimeout(this.reconnectTimeoutId);
        this.shouldAttemptReconnect = false;
        (_a = this.socket) === null || _a === void 0 ? void 0 : _a.close();
    }
    start() {
        this.shouldAttemptReconnect = !!this.reconnectInterval;
        this.progress = 0;
        this.established = false;
        if (this.options.protocols) {
            this.socket = new WebSocket(this.url, this.options.protocols);
        }
        else {
            this.socket = new WebSocket(this.url);
        }
        this.socket.binaryType = 'arraybuffer';
        this.socket.onmessage = (ev) => this.onMessage(ev);
        this.socket.onopen = () => this.onOpen();
        this.socket.onerror = () => this.onClose();
        this.socket.onclose = () => this.onClose();
    }
    resume(_secondsHeadroom) {
        // Nothing to do here
    }
    onOpen() {
        this.progress = 1;
    }
    onClose() {
        if (this.shouldAttemptReconnect) {
            clearTimeout(this.reconnectTimeoutId);
            this.reconnectTimeoutId = setTimeout(() => {
                this.start();
            }, this.reconnectInterval * 1000);
        }
    }
    onMessage(ev) {
        const isFirstChunk = !this.established;
        this.established = true;
        if (isFirstChunk && this.onEstablishedCallback) {
            this.onEstablishedCallback(this);
        }
        if (this.destination) {
            this.destination.write(ev.data);
        }
    }
}
//# sourceMappingURL=websocket-source.js.map