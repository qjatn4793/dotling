import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { pixelate, validatePixelOptions, type PixelOptions } from "@/lib/image/pixelate";
import { removeBg } from "@/lib/removeBg";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let formData: FormData;
  try { formData = await req.formData(); } catch {
    return NextResponse.json({ error: "올바른 업로드 형식이 아닙니다" }, { status: 400 });
  }
  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "이미지가 없습니다" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "이미지는 10MB 이하여야 합니다" }, { status: 413 });
  }
  const options: PixelOptions = {
    resolution: Number(formData.get("resolution") ?? 32),
    palette: String(formData.get("palette") ?? "16"),
    sourceKind: String(formData.get("sourceKind") ?? "image") as PixelOptions["sourceKind"],
  };
  try { validatePixelOptions(options); } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  let buffer = Buffer.from(await file.arrayBuffer());
  try {
    const metadata = await sharp(buffer, { limitInputPixels: 16_777_216 }).metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) {
      return NextResponse.json({ error: "정적 PNG, JPG, WEBP 이미지만 지원합니다" }, { status: 415 });
    }
  } catch {
    return NextResponse.json({ error: "이미지를 읽을 수 없거나 허용 크기를 초과했습니다" }, { status: 400 });
  }
  try {
    if (formData.get("removeBg") === "true") buffer = Buffer.from(await removeBg(buffer));
    const { png, quality } = await pixelate(buffer, options);
    return new NextResponse(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "X-Dotling-Boundary": String(quality.touchesBoundary) },
    });
  } catch {
    return NextResponse.json({ error: "이미지 처리에 실패했습니다. 다시 시도해주세요" }, { status: 500 });
  }
}
