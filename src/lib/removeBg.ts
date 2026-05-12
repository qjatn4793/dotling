import { removeBackground } from "@imgly/background-removal-node";
import sharp from "sharp";

export async function removeBg(inputBuffer: Buffer): Promise<Buffer> {
  const blob = new Blob([new Uint8Array(inputBuffer)]);
  const resultBlob = await removeBackground(blob);
  const arrayBuffer = await resultBlob.arrayBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

export async function removeBgAndFlatten(inputBuffer: Buffer, bgColor = "#888888"): Promise<Buffer> {
  const transparent = await removeBg(inputBuffer);

  const [r, g, b] = [
    parseInt(bgColor.slice(1, 3), 16),
    parseInt(bgColor.slice(3, 5), 16),
    parseInt(bgColor.slice(5, 7), 16),
  ];

  const { width, height } = await sharp(transparent).metadata();
  const background = await sharp({
    create: { width: width!, height: height!, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();

  return sharp(background)
    .composite([{ input: transparent, blend: "over" }])
    .png()
    .toBuffer();
}
