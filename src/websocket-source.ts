// WebSocket streaming source. Kept for completeness; note that WebSocket
// upgrades often don't survive reverse proxies / ingress, which is why the
// progressive HTTP source is preferred for proxied deployments.

import type { ByteSink, JSMpegOptions, Source } from './types.js';

export class WebSocketSource implements Source {
	url: string;
	options: JSMpegOptions;
	socket: WebSocket | null = null;
	streaming = true;

	callbacks: { connect: Array<() => void>; data: Array<() => void> } = { connect: [], data: [] };
	destination: ByteSink | null = null;

	reconnectInterval: number;
	shouldAttemptReconnect: boolean;

	completed = false;
	established = false;
	progress = 0;

	reconnectTimeoutId: ReturnType<typeof setTimeout> | 0 = 0;

	private onEstablishedCallback?: (source: Source) => void;
	private onCompletedCallback?: (source: Source) => void; // Never used

	constructor(url: string, options: JSMpegOptions) {
		this.url = url;
		this.options = options;

		this.reconnectInterval =
			options.reconnectInterval !== undefined ? options.reconnectInterval : 5;
		this.shouldAttemptReconnect = !!this.reconnectInterval;

		this.onEstablishedCallback = options.onSourceEstablished;
		this.onCompletedCallback = options.onSourceCompleted; // Never used
	}

	connect(destination: ByteSink): void {
		this.destination = destination;
	}

	destroy(): void {
		clearTimeout(this.reconnectTimeoutId);
		this.shouldAttemptReconnect = false;
		this.socket?.close();
	}

	start(): void {
		this.shouldAttemptReconnect = !!this.reconnectInterval;
		this.progress = 0;
		this.established = false;

		if (this.options.protocols) {
			this.socket = new WebSocket(this.url, this.options.protocols);
		} else {
			this.socket = new WebSocket(this.url);
		}
		this.socket.binaryType = 'arraybuffer';
		this.socket.onmessage = (ev) => this.onMessage(ev);
		this.socket.onopen = () => this.onOpen();
		this.socket.onerror = () => this.onClose();
		this.socket.onclose = () => this.onClose();
	}

	resume(_secondsHeadroom: number): void {
		// Nothing to do here
	}

	onOpen(): void {
		this.progress = 1;
	}

	onClose(): void {
		if (this.shouldAttemptReconnect) {
			clearTimeout(this.reconnectTimeoutId);
			this.reconnectTimeoutId = setTimeout(() => {
				this.start();
			}, this.reconnectInterval * 1000);
		}
	}

	onMessage(ev: MessageEvent): void {
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
