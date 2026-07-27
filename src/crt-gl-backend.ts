import { labelLayout } from './crt-compositor.js';
import type { CRTBackend, CRTLevels, ResolvedCRTOptions } from './crt-compositor.js';

const VS = [
	'attribute vec2 aPos;',
	'attribute vec2 aUv;',
	'varying vec2 vUv;',
	'void main(){ vUv = aUv; gl_Position = vec4(aPos, 0.0, 1.0); }',
].join('\n');

// Pass 1: generate one snow field with phosphor smear (ping-pong).
const NOISE_FS = [
	'precision highp float;',
	'varying vec2 vUv;',
	'uniform sampler2D uPrev;', // previous snow field
	'uniform float uSeed;', // changes once per PRESENT (not per pixel)
	'uniform float uBlend;', // fraction of previous frame retained (phosphor)
	'uniform vec2  uRes;',
	'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',
	'void main(){',
	'  vec2 px = vUv * uRes;',
	// Horizontal streak: coarse in x, fine in y — reads as TV snow, not dither.
	'  float base = hash(vec2(floor(px.x / 2.0), floor(px.y)) + uSeed);',
	'  float row  = hash(vec2(0.0, floor(px.y)) + uSeed * 1.7);', // whole-row flicker
	'  float n = mix(base, row, 0.15);',
	'  n = pow(n, 0.8);', // lift toward bright sparkle
	'  float prev = texture2D(uPrev, vUv).r;',
	'  float outv = mix(n, prev, uBlend);', // ~20% previous = smear
	'  gl_FragColor = vec4(vec3(outv), 1.0);',
	'}',
].join('\n');

// Pass 2: composite last picture + snow, hard-cut to a colour-bar test card as
// the no-signal screen, and overlay the green corner channel label.
const COMP_FS = [
	'precision highp float;',
	'varying vec2 vUv;',
	'uniform sampler2D uVideo;', // last decoded frame
	'uniform sampler2D uSnow;', // snow field from pass 1
	'uniform sampler2D uLabel;', // baked corner channel label (rgba)
	'uniform float uNoise;', // 0..1 how snowy
	'uniform float uStandby;', // 0/1 hard-cut to the test card
	'uniform float uBlack;', // 0/1 tune-in black screen
	'uniform float uLabelAmt;', // 0/1 corner label opacity
	'uniform float uScan;', // scanline strength
	'uniform vec2  uRes;',
	// EBU-style colour bars with a dark pedestal strip along the bottom.
	'vec3 testCard(vec2 uv){',
	'  float i = floor(uv.x * 7.0);',
	'  vec3 c = vec3(0.0, 0.0, 0.75);', // blue
	'  if      (i < 1.0) c = vec3(0.75);', // grey/white
	'  else if (i < 2.0) c = vec3(0.75, 0.75, 0.0);', // yellow
	'  else if (i < 3.0) c = vec3(0.0, 0.75, 0.75);', // cyan
	'  else if (i < 4.0) c = vec3(0.0, 0.75, 0.0);', // green
	'  else if (i < 5.0) c = vec3(0.75, 0.0, 0.75);', // magenta
	'  else if (i < 6.0) c = vec3(0.75, 0.0, 0.0);', // red
	'  if (uv.y < 0.18) c = mix(vec3(0.02), vec3(0.1), step(0.5, fract(uv.x * 4.0)));',
	'  return c;',
	'}',
	'void main(){',
	'  vec3 pic  = texture2D(uVideo, vUv).rgb;',
	'  float sn  = texture2D(uSnow, vUv).r;',
	'  vec3 withSnow = mix(pic, vec3(sn), uNoise);',
	// Hard-cut to the colour-bar test card as the no-signal screen.
	'  vec3 col = mix(withSnow, testCard(vUv), uStandby);',
	// Subtle CRT scanlines over the picture.
	'  float line = 1.0 - uScan * (0.5 + 0.5 * sin(vUv.y * uRes.y * 3.14159));',
	'  col *= line;',
	// Tune-in black screen (briefly, while the set locks onto the channel).
	'  col = mix(col, vec3(0.0), uBlack);',
	// Green corner channel label on top (like a channel-switch OSD).
	'  vec4 lb = texture2D(uLabel, vUv);',
	'  col = mix(col, lb.rgb, lb.a * uLabelAmt);',
	'  gl_FragColor = vec4(col, 1.0);',
	'}',
].join('\n');

interface FBO {
	tex: WebGLTexture;
	fbo: WebGLFramebuffer;
}

export class CRTGLBackend implements CRTBackend {
	private gl: WebGLRenderingContext;
	private cfg: ResolvedCRTOptions;
	private width = 0;
	private height = 0;

	private quad!: WebGLBuffer;
	private noiseProg!: WebGLProgram;
	private compProg!: WebGLProgram;
	private noiseLoc!: Record<string, WebGLUniformLocation | null>;
	private compLoc!: Record<string, WebGLUniformLocation | null>;

	private snowA!: FBO;
	private snowB!: FBO;
	private videoTex!: WebGLTexture;
	private labelTex!: WebGLTexture;

	private seed = 0;
	private labelText: string;

	private handleLostBound: (e: Event) => void;
	private handleRestoredBound: (e: Event) => void;

	constructor(canvas: HTMLCanvasElement, cfg: ResolvedCRTOptions, options: { preserveDrawingBuffer?: boolean }) {
		this.cfg = cfg;
		this.labelText = cfg.label;

		const attrs: WebGLContextAttributes = {
			preserveDrawingBuffer: !!options.preserveDrawingBuffer,
			alpha: false,
			depth: false,
			stencil: false,
			antialias: false,
			premultipliedAlpha: false,
		};
		const gl =
			(canvas.getContext('webgl', attrs) as WebGLRenderingContext | null) ||
			(canvas.getContext('experimental-webgl', attrs) as WebGLRenderingContext | null);
		if (!gl) {
			throw new Error('CRTGLBackend: failed to get WebGL context');
		}
		this.gl = gl;

		this.handleLostBound = (e: Event) => e.preventDefault();
		this.handleRestoredBound = () => this.initGL();
		canvas.addEventListener('webglcontextlost', this.handleLostBound, false);
		canvas.addEventListener('webglcontextrestored', this.handleRestoredBound, false);

		this.width = canvas.width;
		this.height = canvas.height;
		this.initGL();
	}

	private initGL(): void {
		const gl = this.gl;

		this.quad = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		// interleaved: pos.xy, uv.xy — triangle strip
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]),
			gl.STATIC_DRAW
		);

		this.noiseProg = this.program(VS, NOISE_FS);
		this.compProg = this.program(VS, COMP_FS);
		this.noiseLoc = this.locations(this.noiseProg, ['uPrev', 'uSeed', 'uBlend', 'uRes']);
		this.compLoc = this.locations(this.compProg, [
			'uVideo',
			'uSnow',
			'uLabel',
			'uNoise',
			'uStandby',
			'uBlack',
			'uLabelAmt',
			'uScan',
			'uRes',
		]);

		this.videoTex = this.makeTex(this.width, this.height);
		this.labelTex = this.makeTex(this.width, this.height);
		this.snowA = this.makeFBO(this.width, this.height);
		this.snowB = this.makeFBO(this.width, this.height);

		this.bakeLabel(this.labelText);
	}

	private program(vs: string, fs: string): WebGLProgram {
		const gl = this.gl;
		const p = gl.createProgram()!;
		gl.attachShader(p, this.compile(gl.VERTEX_SHADER, vs));
		gl.attachShader(p, this.compile(gl.FRAGMENT_SHADER, fs));
		gl.linkProgram(p);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
			throw new Error(gl.getProgramInfoLog(p) ?? 'CRT program link error');
		}
		return p;
	}

	private compile(type: number, src: string): WebGLShader {
		const gl = this.gl;
		const s = gl.createShader(type)!;
		gl.shaderSource(s, src);
		gl.compileShader(s);
		if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
			throw new Error(gl.getShaderInfoLog(s) ?? 'CRT shader compile error');
		}
		return s;
	}

	private locations(p: WebGLProgram, names: string[]): Record<string, WebGLUniformLocation | null> {
		const gl = this.gl;
		const out: Record<string, WebGLUniformLocation | null> = {};
		for (const n of names) {
			out[n] = gl.getUniformLocation(p, n);
		}
		return out;
	}

	private makeTex(w: number, h: number, data: TexImageSource | null = null): WebGLTexture {
		const gl = this.gl;
		const t = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, t);
		if (data) {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
		} else {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		}
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return t;
	}

	private makeFBO(w: number, h: number): FBO {
		const gl = this.gl;
		const tex = this.makeTex(w, h);
		const fbo = gl.createFramebuffer()!;
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return { tex, fbo };
	}

	private bindQuad(p: WebGLProgram): void {
		const gl = this.gl;
		const loc = gl.getAttribLocation(p, 'aPos');
		const luv = gl.getAttribLocation(p, 'aUv');
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 16, 0);
		gl.enableVertexAttribArray(luv);
		gl.vertexAttribPointer(luv, 2, gl.FLOAT, false, 16, 8);
	}

	resize(width: number, height: number): void {
		this.width = width | 0;
		this.height = height | 0;
		// Reallocate the offscreen targets at the new size, then rebake the label
		// so it lands in the right corner.
		const gl = this.gl;
		gl.deleteTexture(this.videoTex);
		gl.deleteTexture(this.labelTex);
		gl.deleteFramebuffer(this.snowA.fbo);
		gl.deleteTexture(this.snowA.tex);
		gl.deleteFramebuffer(this.snowB.fbo);
		gl.deleteTexture(this.snowB.tex);
		this.videoTex = this.makeTex(this.width, this.height);
		this.labelTex = this.makeTex(this.width, this.height);
		this.snowA = this.makeFBO(this.width, this.height);
		this.snowB = this.makeFBO(this.width, this.height);
		this.bakeLabel(this.labelText);
	}

	bakeLabel(text: string): void {
		this.labelText = text;
		const gl = this.gl;
		const c = document.createElement('canvas');
		c.width = this.width;
		c.height = this.height;
		const x = c.getContext('2d')!;
		x.clearRect(0, 0, c.width, c.height);
		x.textAlign = 'right';
		x.textBaseline = 'top';
		const lay = labelLayout(this.cfg, c.width, c.height);
		x.font = lay.font;
		x.fillStyle = '#0ad108'; // flat green OSD label — no bloom
		x.fillText(text, lay.x, lay.y);
		gl.bindTexture(gl.TEXTURE_2D, this.labelTex);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
	}

	captureVideo(source: HTMLCanvasElement): void {
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
	}

	present(l: CRTLevels): void {
		const gl = this.gl;
		const w = this.width;
		const h = this.height;

		// Pass 1: snowB = f(snowA, seed)
		this.seed++;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.snowB.fbo);
		gl.viewport(0, 0, w, h);
		gl.useProgram(this.noiseProg);
		this.bindQuad(this.noiseProg);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.snowA.tex);
		gl.uniform1i(this.noiseLoc.uPrev, 0);
		gl.uniform1f(this.noiseLoc.uSeed, (this.seed % 997) * 1.37);
		gl.uniform1f(this.noiseLoc.uBlend, this.cfg.phosphorBlend);
		gl.uniform2f(this.noiseLoc.uRes, w, h);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		const tmp = this.snowA;
		this.snowA = this.snowB;
		this.snowB = tmp; // ping-pong

		// Pass 2: composite to the visible canvas.
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, w, h);
		gl.useProgram(this.compProg);
		this.bindQuad(this.compProg);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
		gl.uniform1i(this.compLoc.uVideo, 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.snowA.tex);
		gl.uniform1i(this.compLoc.uSnow, 1);
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, this.labelTex);
		gl.uniform1i(this.compLoc.uLabel, 2);
		gl.uniform1f(this.compLoc.uNoise, l.noise);
		gl.uniform1f(this.compLoc.uStandby, l.standby);
		gl.uniform1f(this.compLoc.uBlack, l.black);
		gl.uniform1f(this.compLoc.uLabelAmt, l.label);
		gl.uniform1f(this.compLoc.uScan, this.cfg.scanlines);
		gl.uniform2f(this.compLoc.uRes, w, h);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	destroy(): void {
		const gl = this.gl;
		const canvas = gl.canvas as HTMLCanvasElement;
		canvas.removeEventListener('webglcontextlost', this.handleLostBound, false);
		canvas.removeEventListener('webglcontextrestored', this.handleRestoredBound, false);
		gl.deleteBuffer(this.quad);
		gl.deleteProgram(this.noiseProg);
		gl.deleteProgram(this.compProg);
		gl.deleteTexture(this.videoTex);
		gl.deleteTexture(this.labelTex);
		gl.deleteFramebuffer(this.snowA.fbo);
		gl.deleteTexture(this.snowA.tex);
		gl.deleteFramebuffer(this.snowB.fbo);
		gl.deleteTexture(this.snowB.tex);
	}
}
