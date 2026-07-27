// Web Audio output. Plays decoded stereo PCM and handles the iOS "unlock on
// first user gesture" dance.

import { now } from './util.js';
import type { AudioOutput, JSMpegOptions } from './types.js';

type AudioContextWithConnections = AudioContext & { _connections?: number };

interface WebkitWindow {
	AudioContext?: typeof AudioContext;
	webkitAudioContext?: typeof AudioContext;
}

export class WebAudioOutput implements AudioOutput {
	static CachedContext: AudioContextWithConnections | null = null;

	context: AudioContextWithConnections;
	gain: GainNode;
	destination: AudioNode;

	startTime = 0;
	buffer: AudioBuffer | null = null;
	wallclockStartTime = 0;
	volume = 1;
	enabled = true;
	unlocked: boolean;

	private unlockCallback: (() => void) | null = null;

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	constructor(_options?: JSMpegOptions) {
		const win = window as unknown as WebkitWindow;
		const Ctor = (win.AudioContext || win.webkitAudioContext)!;

		this.context = WebAudioOutput.CachedContext =
			WebAudioOutput.CachedContext || (new Ctor() as AudioContextWithConnections);

		this.gain = this.context.createGain();
		this.destination = this.gain;

		// Keep track of the number of connections to this AudioContext, so we
		// can safely close() it when we're the only one connected to it.
		this.gain.connect(this.context.destination);
		this.context._connections = (this.context._connections || 0) + 1;

		this.startTime = 0;
		this.buffer = null;
		this.wallclockStartTime = 0;
		this.volume = 1;
		this.enabled = true;

		this.unlocked = !WebAudioOutput.NeedsUnlocking();
	}

	get enqueuedTime(): number {
		// The AudioContext.currentTime is only updated every so often, so if we
		// want to get exact timing, we need to rely on the system time.
		return Math.max(this.wallclockStartTime - now(), 0);
	}

	destroy(): void {
		this.gain.disconnect();
		this.context._connections = (this.context._connections || 0) - 1;

		if (this.context._connections === 0) {
			this.context.close();
			WebAudioOutput.CachedContext = null;
		}
	}

	play(sampleRate: number, left: Float32Array, right: Float32Array): void {
		if (!this.enabled) {
			return;
		}

		// If the context is not unlocked yet, we simply advance the start time
		// to "fake" actually playing audio. This will keep the video in sync.
		if (!this.unlocked) {
			const ts = now();
			if (this.wallclockStartTime < ts) {
				this.wallclockStartTime = ts;
			}
			this.wallclockStartTime += left.length / sampleRate;
			return;
		}

		this.gain.gain.value = this.volume;

		const buffer = this.context.createBuffer(2, left.length, sampleRate);
		buffer.getChannelData(0).set(left);
		buffer.getChannelData(1).set(right);

		const source = this.context.createBufferSource();
		source.buffer = buffer;
		source.connect(this.destination);

		const nowTime = this.context.currentTime;
		const duration = buffer.duration;
		if (this.startTime < nowTime) {
			this.startTime = nowTime;
			this.wallclockStartTime = now();
		}

		source.start(this.startTime);
		this.startTime += duration;
		this.wallclockStartTime += duration;
	}

	stop(): void {
		// Meh; there seems to be no simple way to get a list of currently
		// active source nodes from the Audio Context, and maintaining this
		// list ourselfs would be a pain, so we just set the gain to 0
		// to cut off all enqueued audio instantly.
		this.gain.gain.value = 0;
	}

	resetEnqueuedTime(): void {
		this.startTime = this.context.currentTime;
		this.wallclockStartTime = now();
	}

	unlock(callback?: () => void): void {
		if (this.unlocked) {
			if (callback) {
				callback();
			}
			return;
		}

		this.unlockCallback = callback ?? null;

		// Create empty buffer and play it
		const buffer = this.context.createBuffer(1, 1, 22050);
		const source = this.context.createBufferSource();
		source.buffer = buffer;
		source.connect(this.destination);
		source.start(0);

		setTimeout(() => this.checkIfUnlocked(source, 0), 0);
	}

	checkIfUnlocked(source: AudioBufferSourceNode, attempt: number): void {
		const s = source as AudioBufferSourceNode & {
			playbackState?: number;
			PLAYING_STATE?: number;
			FINISHED_STATE?: number;
		};
		if (s.playbackState === s.PLAYING_STATE || s.playbackState === s.FINISHED_STATE) {
			this.unlocked = true;
			if (this.unlockCallback) {
				this.unlockCallback();
				this.unlockCallback = null;
			}
		} else if (attempt < 10) {
			// Jeez, what a shit show. Thanks iOS!
			setTimeout(() => this.checkIfUnlocked(source, attempt + 1), 100);
		}
	}

	static NeedsUnlocking(): boolean {
		return /iPhone|iPad|iPod/i.test(navigator.userAgent);
	}

	static IsSupported(): boolean {
		const win = window as unknown as WebkitWindow;
		return !!(win.AudioContext || win.webkitAudioContext);
	}
}
