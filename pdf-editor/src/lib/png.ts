// PNG encoding with "colour bleed": fully transparent pixels take the colour of their
// nearest visible neighbour. Canvas toBlob() stores them as black, and PDF viewers mix
// that black into edges when they smooth an image, leaving a thin grey outline around
// whiteout patches and stickers. Encoding ourselves keeps full control of RGBA.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, start = 0, end = bytes.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Spread colour into transparent pixels (alpha stays 0), `passes` pixels deep. */
export function bleed(data: Uint8ClampedArray, w: number, h: number, passes = 3) {
  const known = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) known[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  for (let pass = 0; pass < passes; pass++) {
    const add: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (known[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      const take = (j: number) => {
        if (!known[j]) return;
        r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++;
      };
      if (x > 0) take(i - 1);
      if (x < w - 1) take(i + 1);
      if (y > 0) take(i - w);
      if (y < h - 1) take(i + w);
      if (n) {
        data[i * 4] = r / n; data[i * 4 + 1] = g / n; data[i * 4 + 2] = b / n;
        add.push(i);
      }
    }
    if (!add.length) break;
    for (const i of add) known[i] = 1;
  }
}

async function zlib(raw: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate');
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeRGBA(data: Uint8ClampedArray, w: number, h: number): Promise<Uint8Array> {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * 4 + 1);
    raw[o] = 0; // filter: none
    raw.set(data.subarray(y * w * 4, (y + 1) * w * 4), o + 1);
  }
  const idat = await zlib(raw);
  const chunks: [string, Uint8Array][] = [];
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  chunks.push(['IHDR', ihdr], ['IDAT', idat], ['IEND', new Uint8Array(0)]);
  const size = 8 + chunks.reduce((s, [, d]) => s + 12 + d.length, 0);
  const out = new Uint8Array(size);
  out.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  let p = 8;
  const odv = new DataView(out.buffer);
  for (const [type, d] of chunks) {
    odv.setUint32(p, d.length);
    for (let i = 0; i < 4; i++) out[p + 4 + i] = type.charCodeAt(i);
    out.set(d, p + 8);
    odv.setUint32(p + 8 + d.length, crc32(out, p + 4, p + 8 + d.length));
    p += 12 + d.length;
  }
  return out;
}

/** PNG bytes of a canvas, with colour bleed when the browser can compress streams. */
export async function canvasToPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }
  const img = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
  bleed(img.data, c.width, c.height);
  return encodeRGBA(img.data, c.width, c.height);
}
