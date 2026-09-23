import sharp from "sharp";

/** Experimental cutout for uniform generated backgrounds; keeps enclosed matching foreground pixels. */
export async function removeFlatBackground(input: Buffer, tolerance = 12) {
  if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 64) throw new Error("배경 색상 허용 범위가 올바르지 않습니다");
  const { data, info } = await sharp(input, { limitInputPixels: 16_777_216 }).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const border: number[] = [];
  for (let x = 0; x < width; x++) { border.push(x); if (height > 1) border.push((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { border.push(y * width); if (width > 1) border.push(y * width + width - 1); }
  const background = [0, 1, 2].map((channel) => {
    const values = border.map((p) => data[p * 4 + channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  });
  const matches = (p: number) => data[p * 4 + 3] === 0 || background.every((value, c) => Math.abs(data[p * 4 + c] - value) <= tolerance);
  if (border.filter(matches).length / border.length < 0.95) throw new Error("단색 배경이 아니거나 캐릭터가 가장자리에 닿아 있습니다");
  const queue = new Int32Array(width * height);
  const visited = new Uint8Array(width * height);
  let head = 0, tail = 0;
  function visit(p: number) {
    if (visited[p] || !matches(p)) return;
    visited[p] = 1; queue[tail++] = p;
  }
  border.forEach(visit);
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    if (x > 0) visit(p - 1);
    if (x + 1 < width) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p + width < width * height) visit(p + width);
  }
  for (let p = 0; p < visited.length; p++) if (visited[p]) data.fill(0, p * 4, p * 4 + 4);
  // Generated images can contain a few isolated colored pixels on the outer border.
  // Remove only boundary-connected components of at most four source pixels;
  // larger edge content stays intact and is rejected by reference normalization.
  const removedBackgroundPixels = tail;
  visited.fill(0);
  let removedBorderSpecks = 0;
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || data[start * 4 + 3] === 0) continue;
    head = 0; tail = 1; queue[0] = start; visited[start] = 1;
    let boundary = false;
    while (head < tail) {
      const p = queue[head++], x = p % width;
      if (x === 0 || x === width - 1 || p < width || p >= width * (height - 1)) boundary = true;
      const neighbors = [x > 0 ? p - 1 : -1, x + 1 < width ? p + 1 : -1, p >= width ? p - width : -1, p + width < visited.length ? p + width : -1];
      for (const n of neighbors) if (n >= 0 && !visited[n] && data[n * 4 + 3] > 0) { visited[n] = 1; queue[tail++] = n; }
    }
    if (boundary && tail <= 4) {
      for (let i = 0; i < tail; i++) data.fill(0, queue[i] * 4, queue[i] * 4 + 4);
      removedBorderSpecks += tail;
    }
  }
  const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { png, background, removedPixels: removedBackgroundPixels, removedBorderSpecks, tolerance };
}
