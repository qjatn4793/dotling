import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getPaletteColors, paletteColorCount, nearestColor } from "@/lib/palettes";
import { removeBgAndFlatten } from "@/lib/removeBg";

const UPSCALE = 8;

async function pixelate(buffer: Buffer, resolution: number, palette: string): Promise<Buffer> {
  const fixedPalette = getPaletteColors(palette);
  const colorCount = paletteColorCount(palette);

  const small = await sharp(buffer)
    .resize(resolution, resolution, { fit: "cover", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = small;
  const { width, height, channels } = info;

  let pixelData: Buffer;

  if (fixedPalette) {
    const out = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * channels];
      const g = data[i * channels + 1];
      const b = data[i * channels + 2];
      const [nr, ng, nb] = nearestColor(r, g, b, fixedPalette);
      out[i * 3] = nr;
      out[i * 3 + 1] = ng;
      out[i * 3 + 2] = nb;
    }
    pixelData = out;
  } else {
    const quantized = await sharp(buffer)
      .resize(resolution, resolution, { fit: "cover", kernel: "lanczos3" })
      .png({ colours: colorCount, dither: 1.0 })
      .toBuffer();

    const rawQ = await sharp(quantized).raw().toBuffer({ resolveWithObject: true });
    const qCh = rawQ.info.channels;
    const out = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      out[i * 3] = rawQ.data[i * qCh];
      out[i * 3 + 1] = rawQ.data[i * qCh + 1];
      out[i * 3 + 2] = rawQ.data[i * qCh + 2];
    }
    pixelData = out;
  }

  return sharp(pixelData, { raw: { width, height, channels: 3 } })
    .resize(width * UPSCALE, height * UPSCALE, { kernel: "nearest" })
    .png()
    .toBuffer();
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("image") as File | null;
  const resolution = parseInt(formData.get("resolution") as string, 10) || 32;
  const palette = (formData.get("palette") as string) || "16";
  const removeBg = formData.get("removeBg") === "true";

  if (!file) {
    return NextResponse.json({ error: "이미지가 없습니다" }, { status: 400 });
  }

  let buffer = Buffer.from(await file.arrayBuffer());

  if (removeBg) {
    buffer = Buffer.from(await removeBgAndFlatten(buffer));
  }

  const result = await pixelate(buffer, resolution, palette);

  return new NextResponse(new Uint8Array(result), {
    headers: { "Content-Type": "image/png" },
  });
}
