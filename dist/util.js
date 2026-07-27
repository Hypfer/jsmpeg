// Small standalone helpers. These replace the utility functions that used to
// hang off the global `JSMpeg` namespace object. No import-time side effects.
/** Current time in seconds, using the high-resolution clock when available. */
export function now() {
    return typeof performance !== 'undefined' && performance.now
        ? performance.now() / 1000
        : Date.now() / 1000;
}
/** Fill a (typed) array with a value, falling back to a manual loop. */
export function fill(array, value) {
    if (array.fill) {
        array.fill(value);
    }
    else {
        for (let i = 0; i < array.length; i++) {
            array[i] = value;
        }
    }
}
/** Decode a base64 string into an ArrayBuffer (browser `atob`). */
export function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}
//# sourceMappingURL=util.js.map