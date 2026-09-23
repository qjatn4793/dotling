import sharp from "sharp";

const names = [
  "data/experiments/local-idle-v1/idle-0.png",
  "data/experiments/local-idle-v1/idle-2.png",
  "data/experiments/shoulder-idle-v1/idle-2.png",
];
const parts = await Promise.all(names.map(async (name, i) => ({
  input: await sharp(name).extract({ left: 22, top: 22, width: 16, height: 13 }).resize(320, 260, { kernel: "nearest" }).png().toBuffer(),
  left: i * 320, top: 40,
})));
const labels = Buffer.from('<svg width="960" height="40"><rect width="960" height="40" fill="#20232a"/><g fill="white" font-size="18"><text x="16" y="26">Reference</text><text x="336" y="26">Previous: inner texture only</text><text x="656" y="26">New: shoulder contour + seam</text></g></svg>');
await sharp({ create: { width: 960, height: 300, channels: 4, background: "#9faeb5" } }).composite([{ input: labels, top: 0, left: 0 }, ...parts]).png().toFile("data/experiments/shoulder-idle-v1/detail-comparison.png");
