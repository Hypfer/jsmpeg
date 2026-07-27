// The Player sets up the connections between source, demuxer, decoders,
// renderer and audio output. It ties everything together, is responsible for
// scheduling decoding and provides some convenience methods for external users.
import { AjaxProgressiveSource } from './ajax-progressive-source.js';
import { AjaxSource } from './ajax-source.js';
import { Canvas2DRenderer } from './canvas2d-renderer.js';
import { FetchSource } from './fetch-source.js';
import { MP2Audio } from './mp2-decoder.js';
import { MPEG1Video } from './mpeg1-decoder.js';
import { TSDemuxer } from './ts-demuxer.js';
import { now } from './util.js';
import { WebAudioOutput } from './webaudio-output.js';
import { WebGLRenderer } from './webgl-renderer.js';
import { WebSocketSource } from './websocket-source.js';
export class Player {
    constructor(url, options) {
        this.paused = true;
        this.unpauseOnShow = false;
        this.wantsToPlay = false;
        this.isPlaying = false;
        this.animationId = null;
        this.startTime = 0;
        this.options = options || {};
        // Forward the source's connection state to a custom renderer that wants it
        // (duck-typed StreamStateSink), preserving any user callback. Wrapped before
        // the source is built, since FetchSource reads the callback then.
        if (options.createRenderer) {
            const userStreamCb = options.onStreamStateChange;
            options.onStreamStateChange = (status) => {
                var _a, _b;
                (_b = (_a = this.renderer) === null || _a === void 0 ? void 0 : _a.setStreamState) === null || _b === void 0 ? void 0 : _b.call(_a, status.state);
                userStreamCb === null || userStreamCb === void 0 ? void 0 : userStreamCb(status);
            };
        }
        if (options.source) {
            this.source = new options.source(url, options);
            options.streaming = !!this.source.streaming;
        }
        else if (url.match(/^wss?:\/\//)) {
            this.source = new WebSocketSource(url, options);
            options.streaming = true;
        }
        else if (options.streaming) {
            // Live HTTP chunked-transfer stream (proxy-friendly, no WS upgrade).
            this.source = new FetchSource(url, options);
            options.streaming = true;
        }
        else if (options.progressive !== false) {
            this.source = new AjaxProgressiveSource(url, options);
            options.streaming = false;
        }
        else {
            this.source = new AjaxSource(url, options);
            options.streaming = false;
        }
        this.maxAudioLag = options.maxAudioLag || 0.25;
        this.loop = options.loop !== false;
        this.autoplay = !!options.autoplay || !!options.streaming;
        this.demuxer = new TSDemuxer(options);
        this.source.connect(this.demuxer);
        if (options.video !== false) {
            this.video = new MPEG1Video(options);
            // A supplied factory (e.g. the CRTCompositor) takes over; otherwise the
            // plain base renderer paints straight to canvas, like stock jsmpeg.
            this.renderer = options.createRenderer
                ? options.createRenderer(options)
                : !options.disableGl && WebGLRenderer.IsSupported()
                    ? new WebGLRenderer(options)
                    : new Canvas2DRenderer(options);
            this.demuxer.connect(TSDemuxer.STREAM.VIDEO_1, this.video);
            this.video.connect(this.renderer);
        }
        if (options.audio !== false && WebAudioOutput.IsSupported()) {
            this.audio = new MP2Audio(options);
            this.audioOut = new WebAudioOutput(options);
            this.demuxer.connect(TSDemuxer.STREAM.AUDIO_1, this.audio);
            this.audio.connect(this.audioOut);
        }
        this.paused = true;
        this.unpauseOnShow = false;
        this.visibilityBound = () => this.showHide();
        if (options.pauseWhenHidden !== false) {
            document.addEventListener('visibilitychange', this.visibilityBound);
        }
        this.startLoading();
    }
    get currentTime() {
        return this.getCurrentTime();
    }
    set currentTime(time) {
        this.setCurrentTime(time);
    }
    get volume() {
        return this.getVolume();
    }
    set volume(volume) {
        this.setVolume(volume);
    }
    startLoading() {
        this.source.start();
        if (this.autoplay) {
            this.play();
        }
    }
    showHide() {
        if (document.visibilityState === 'hidden') {
            this.unpauseOnShow = this.wantsToPlay;
            this.pause();
        }
        else if (this.unpauseOnShow) {
            this.play();
        }
    }
    play() {
        if (this.animationId) {
            return;
        }
        this.animationId = requestAnimationFrame(() => this.update());
        this.wantsToPlay = true;
        this.paused = false;
    }
    pause() {
        if (this.paused) {
            return;
        }
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
        }
        this.animationId = null;
        this.wantsToPlay = false;
        this.isPlaying = false;
        this.paused = true;
        if (this.audio && this.audio.canPlay) {
            // Seek to the currentTime again - audio may already be enqueued a bit
            // further, so we have to rewind it.
            this.audioOut.stop();
            this.seek(this.currentTime);
        }
        if (this.options.onPause) {
            this.options.onPause(this);
        }
    }
    getVolume() {
        return this.audioOut ? this.audioOut.volume : 0;
    }
    setVolume(volume) {
        if (this.audioOut) {
            this.audioOut.volume = volume;
        }
    }
    stop() {
        this.pause();
        this.seek(0);
        if (this.video && this.options.decodeFirstFrame !== false) {
            this.video.decode();
        }
    }
    destroy() {
        var _a, _b;
        this.pause();
        document.removeEventListener('visibilitychange', this.visibilityBound);
        (_b = (_a = this.source).destroy) === null || _b === void 0 ? void 0 : _b.call(_a);
        this.video && this.video.destroy();
        this.renderer && this.renderer.destroy();
        this.audio && this.audio.destroy();
        this.audioOut && this.audioOut.destroy();
    }
    seek(time) {
        const startOffset = this.audio && this.audio.canPlay ? this.audio.startTime : this.video.startTime;
        if (this.video) {
            this.video.seek(time + startOffset);
        }
        if (this.audio) {
            this.audio.seek(time + startOffset);
        }
        this.startTime = now() - time;
    }
    getCurrentTime() {
        return this.audio && this.audio.canPlay
            ? this.audio.currentTime - this.audio.startTime
            : this.video.currentTime - this.video.startTime;
    }
    setCurrentTime(time) {
        this.seek(time);
    }
    update() {
        this.animationId = requestAnimationFrame(() => this.update());
        if (!this.source.established) {
            if (this.renderer) {
                this.renderer.renderProgress(this.source.progress);
            }
            return;
        }
        if (!this.isPlaying) {
            this.isPlaying = true;
            this.startTime = now() - this.currentTime;
            if (this.options.onPlay) {
                this.options.onPlay(this);
            }
        }
        if (this.options.streaming) {
            this.updateForStreaming();
        }
        else {
            this.updateForStaticFile();
        }
    }
    updateForStreaming() {
        // When streaming, immediately decode everything we have buffered up until
        // now to minimize playback latency.
        if (this.video) {
            this.video.decode();
        }
        if (this.audio) {
            let decoded = false;
            do {
                // If there's a lot of audio enqueued already, disable output and
                // catch up with the encoding.
                if (this.audioOut.enqueuedTime > this.maxAudioLag) {
                    this.audioOut.resetEnqueuedTime();
                    this.audioOut.enabled = false;
                }
                decoded = this.audio.decode();
            } while (decoded);
            this.audioOut.enabled = true;
        }
    }
    nextFrame() {
        if (this.source.established && this.video) {
            return this.video.decode();
        }
        return false;
    }
    updateForStaticFile() {
        let notEnoughData = false, headroom = 0;
        // If we have an audio track, we always try to sync the video to the audio.
        // Gaps and discontinuities are far more percetable in audio than in video.
        if (this.audio && this.audio.canPlay) {
            // Do we have to decode and enqueue some more audio data?
            while (!notEnoughData && this.audio.decodedTime - this.audio.currentTime < 0.25) {
                notEnoughData = !this.audio.decode();
            }
            // Sync video to audio
            if (this.video && this.video.currentTime < this.audio.currentTime) {
                notEnoughData = !this.video.decode();
            }
            headroom = this.demuxer.currentTime - this.audio.currentTime;
        }
        else if (this.video) {
            // Video only - sync it to player's wallclock
            const targetTime = now() - this.startTime + this.video.startTime, frameTime = 1 / this.video.frameRate;
            const lateTime = targetTime - this.video.currentTime;
            if (this.video && lateTime > 0) {
                // If the video is too far behind (>2 frames), simply reset the
                // target time to the next frame instead of trying to catch up.
                if (lateTime > frameTime * 2) {
                    this.startTime += lateTime;
                }
                notEnoughData = !this.video.decode();
            }
            headroom = this.demuxer.currentTime - targetTime;
        }
        // Notify the source of the playhead headroom, so it can decide whether to
        // continue loading further data.
        this.source.resume(headroom);
        // If we failed to decode and the source is complete, it means we reached
        // the end of our data. We may want to loop.
        if (notEnoughData && this.source.completed) {
            if (this.loop) {
                this.seek(0);
            }
            else {
                this.pause();
                if (this.options.onEnded) {
                    this.options.onEnded(this);
                }
            }
        }
        // If there's not enough data and the source is not completed, we have
        // just stalled.
        else if (notEnoughData && this.options.onStalled) {
            this.options.onStalled(this);
        }
    }
}
//# sourceMappingURL=player.js.map