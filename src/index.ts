// Public API. Import the named exports you need:
//
//   import { Player } from '@jsmpeg/core';
//   const player = new Player(url, { canvas });
//
// Nothing here touches a global object and importing has no side effects.

export { Player } from './player.js';

export { BitBuffer, BitBufferMode } from './bit-buffer.js';
export { BaseDecoder } from './decoder-base.js';
export { MPEG1Video } from './mpeg1-decoder.js';
export { MP2Audio } from './mp2-decoder.js';
export { TSDemuxer, TS_STREAM } from './ts-demuxer.js';

export { WebGLRenderer } from './webgl-renderer.js';
export { Canvas2DRenderer } from './canvas2d-renderer.js';
export { CRTCompositor } from './crt-compositor.js';
export { WebAudioOutput } from './webaudio-output.js';

export { AjaxSource } from './ajax-source.js';
export { AjaxProgressiveSource } from './ajax-progressive-source.js';
export { FetchSource } from './fetch-source.js';
export { WebSocketSource } from './websocket-source.js';

export { now, fill, base64ToArrayBuffer } from './util.js';

export type {
	Source,
	SourceConstructor,
	Demuxer,
	Decoder,
	VideoDecoder,
	AudioDecoder,
	Renderer,
	AudioOutput,
	ByteSink,
	PlaneData,
	JSMpegOptions,
	StreamState,
	StreamStatus,
	StreamStateSink,
	RendererFactory,
} from './types.js';

// Only the consumer-facing config is public; the backend/levels/resolved-knob
// contracts stay internal to the CRT modules.
export type { CRTOptions } from './crt-compositor.js';
