import sharp from "sharp";

/** Trim small off-guide artifacts only after cutout; refuse major silhouette changes. */
export async function constrainToPose(cutout: Buffer, transparentGuide: Buffer, margin = 4, maxRemovedRatio = 0.05) {
  if (!Number.isInteger(margin) || margin < 1 || margin > 16 || !Number.isFinite(maxRemovedRatio) || maxRemovedRatio < 0 || maxRemovedRatio > 0.1) throw new Error("윤곽 마스크 설정이 올바르지 않습니다");
  const source = await sharp(cutout).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const guideInfo = await sharp(transparentGuide).metadata();
  if (!guideInfo.hasAlpha || guideInfo.width !== source.info.width || guideInfo.height !== source.info.height) throw new Error("윤곽 가이드의 크기와 투명도를 확인해주세요");
  // Sharp's morphology uses dark foreground: erode expands the white alpha region.
  const mask = await sharp(transparentGuide).extractChannel("alpha").erode(margin).raw().toBuffer();
  let foreground = 0, removed = 0;
  for (let p = 0; p < mask.length; p++) {
    if (source.data[p * 4 + 3] >= 128) { foreground++; if (!mask[p]) removed++; }
  }
  if (!foreground) throw new Error("배경 제거 결과가 비어 있습니다");
  const removedRatio = removed / foreground;
  if (removedRatio > maxRemovedRatio) throw new Error(`가이드 밖 픽셀이 ${(removedRatio * 100).toFixed(2)}%입니다. 자동 자르기 대신 수동 검수가 필요합니다`);
  for (let p = 0; p < mask.length; p++) if (!mask[p]) source.data.fill(0, p * 4, p * 4 + 4);
  const png = await sharp(source.data, { raw: { width: source.info.width, height: source.info.height, channels: 4 } }).png().toBuffer();
  return { png, removed, foreground, removedRatio, margin };
}
