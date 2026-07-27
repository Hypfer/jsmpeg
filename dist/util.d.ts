/** Current time in seconds, using the high-resolution clock when available. */
export declare function now(): number;
/** Fill a (typed) array with a value, falling back to a manual loop. */
export declare function fill(array: {
    fill?: (value: number) => void;
    length: number;
    [index: number]: number;
}, value: number): void;
/** Decode a base64 string into an ArrayBuffer (browser `atob`). */
export declare function base64ToArrayBuffer(base64: string): ArrayBuffer;
//# sourceMappingURL=util.d.ts.map