// Live streaming source over plain HTTP using chunked transfer encoding,
// consumed via the Fetch API's readable response body.
//
// This is the proxy-friendly alternative to WebSockets for live feeds: a single
// long-lived GET with no protocol upgrade, so it survives reverse proxies and
// ingress that would drop a WS connection. Requires readable `res.body` streams
// (Baseline "widely available" since Jan 2019; iOS Safari 10.3+).
//
// Deployment notes: disable proxy response buffering (nginx `proxy_buffering
// off` / `X-Accel-Buffering: no`) and don't gzip the stream, or latency will
// suffer. Encode with a short GOP so the client starts and recovers quickly.
//
// Unlike the other (faithfully-ported) sources, this one is a ground-up rewrite
// built around an explicit state machine so consumers can observe the live
// connection (connecting / streaming / stalled / reconnecting / closed / error)
// rather than inferring it from loose booleans. The `established` / `completed`
// / `progress` fields the Player relies on are derived from that state.

import type {
	ByteSink,
	JSMpegOptions,
	Source,
	StreamState,
	StreamStateListener,
	StreamStatus,
} from './types.js';

export class FetchSource implements Source {
	readonly url: string;
	readonly streaming = true;

	// Derived from `state` (see setState) for Player compatibility.
	established = false;
	completed = false;
	progress = 0;

	reconnectInterval: number;
	stallTimeout: number;

	private _state: StreamState = 'idle';
	private bytesReceived = 0;
	private reconnectCount = 0;
	private lastError: unknown = null;

	private destination: ByteSink | null = null;
	private abortController: AbortController | null = null;
	private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	private reconnectTimeoutId: ReturnType<typeof setTimeout> | 0 = 0;
	private stallTimeoutId: ReturnType<typeof setTimeout> | 0 = 0;

	private shouldAttemptReconnect: boolean;
	private listeners = new Set<StreamStateListener>();

	private onEstablishedCallback?: (source: Source) => void;
	private onCompletedCallback?: (source: Source) => void;

	constructor(url: string, options: JSMpegOptions) {
		this.url = url;

		this.reconnectInterval =
			options.reconnectInterval !== undefined ? options.reconnectInterval : 5;
		this.shouldAttemptReconnect = !!this.reconnectInterval;
		this.stallTimeout = options.stallTimeout || 0;

		this.onEstablishedCallback = options.onSourceEstablished;
		this.onCompletedCallback = options.onSourceCompleted;
		if (options.onStreamStateChange) {
			this.listeners.add(options.onStreamStateChange);
		}
	}

	// --- Observability ------------------------------------------------------

	get state(): StreamState {
		return this._state;
	}

	get status(): StreamStatus {
		return {
			state: this._state,
			bytesReceived: this.bytesReceived,
			reconnectCount: this.reconnectCount,
			lastError: this.lastError,
		};
	}

	/** Subscribe to state transitions. Returns an unsubscribe function. */
	addStateListener(listener: StreamStateListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private setState(state: StreamState): void {
		if (state === this._state) {
			return;
		}
		this._state = state;

		const live = state === 'streaming' || state === 'stalled';
		this.established = live;
		this.completed = state === 'closed' || state === 'error';
		this.progress = live ? 1 : 0;

		const snapshot = this.status;
		for (const listener of this.listeners) {
			listener(snapshot);
		}
	}

	// --- Source contract ----------------------------------------------------

	connect(destination: ByteSink): void {
		this.destination = destination;
	}

	start(): void {
		clearTimeout(this.reconnectTimeoutId);
		this.shouldAttemptReconnect = !!this.reconnectInterval;
		this.bytesReceived = 0;
		this.setState('connecting');

		this.abortController = new AbortController();

		fetch(this.url, {
			method: 'GET',
			signal: this.abortController.signal,
			cache: 'no-store',
		})
			.then((res) => {
				if (res.ok && res.body && res.status >= 200 && res.status <= 299) {
					return this.pump(res.body.getReader());
				}
				// Non-2xx or bodyless response: treat as a failed connection.
				this.handleDisconnect(new Error(`HTTP ${res.status}`));
			})
			.catch((err) => {
				if (!FetchSource.isAbortError(err)) {
					this.handleDisconnect(err);
				}
			});
	}

	resume(_secondsHeadroom: number): void {
		// Nothing to do here; live data is pushed as it arrives.
	}

	destroy(): void {
		clearTimeout(this.reconnectTimeoutId);
		this.clearStallTimer();
		this.shouldAttemptReconnect = false;

		// Cancel the read loop and abort the in-flight request.
		this.reader?.cancel().catch(() => {});
		this.reader = null;
		this.abortController?.abort();

		this.setState('closed');
	}

	// --- Internals ----------------------------------------------------------

	private pump(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
		this.reader = reader;
		return reader
			.read()
			.then((result) => {
				if (result.done) {
					// The server ended the stream on its own.
					this.reader = null;
					this.clearStallTimer();
					this.handleDisconnect(null);
					return;
				}

				const isFirstChunk = !this.established;
				this.bytesReceived += result.value.byteLength;
				this.setState('streaming');
				this.resetStallTimer();

				if (isFirstChunk && this.onEstablishedCallback) {
					this.onEstablishedCallback(this);
				}

				if (this.destination) {
					// Hand over the exact view; the demuxer stitches chunk
					// boundaries back together via its leftover-byte handling.
					this.destination.write(result.value);
				}

				return this.pump(reader);
			})
			.catch((err) => {
				this.reader = null;
				this.clearStallTimer();
				if (!FetchSource.isAbortError(err)) {
					this.handleDisconnect(err);
				}
			});
	}

	private handleDisconnect(error: unknown): void {
		this.lastError = error;

		if (this.shouldAttemptReconnect) {
			this.reconnectCount++;
			this.setState('reconnecting');
			clearTimeout(this.reconnectTimeoutId);
			this.reconnectTimeoutId = setTimeout(() => {
				this.start();
			}, this.reconnectInterval * 1000);
		} else {
			this.setState(error ? 'error' : 'closed');
			if (this.onCompletedCallback) {
				this.onCompletedCallback(this);
			}
		}
	}

	private resetStallTimer(): void {
		if (!this.stallTimeout) {
			return;
		}
		clearTimeout(this.stallTimeoutId);
		this.stallTimeoutId = setTimeout(() => {
			// Connection is still open but no data has arrived — surface it.
			if (this._state === 'streaming') {
				this.setState('stalled');
			}
		}, this.stallTimeout * 1000);
	}

	private clearStallTimer(): void {
		clearTimeout(this.stallTimeoutId);
		this.stallTimeoutId = 0;
	}

	private static isAbortError(err: unknown): boolean {
		return !!err && (err as { name?: string }).name === 'AbortError';
	}
}
