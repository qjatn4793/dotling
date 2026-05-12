type RGB = [number, number, number];

export const PALETTE_COLORS: Record<string, RGB[]> = {
  nes: [
    [0,0,0],[252,252,252],[248,248,248],[188,188,188],
    [124,124,124],[164,0,0],[228,0,88],[216,0,204],
    [120,0,248],[0,0,252],[0,88,248],[0,120,248],
    [0,168,248],[0,232,216],[0,252,160],[0,232,48],
    [0,188,0],[0,144,0],[88,248,152],[248,216,120],
    [248,184,0],[248,120,88],[248,56,0],[248,56,0],
    [228,92,16],[172,124,0],[164,0,0],[168,0,32],
  ],
  gameboy: [
    [15,56,15],[48,98,48],[139,172,15],[155,188,15],
  ],
};

export function nearestColor(r: number, g: number, b: number, palette: RGB[]): RGB {
  let best = palette[0];
  let bestDist = Infinity;
  for (const color of palette) {
    const dist =
      (r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = color;
    }
  }
  return best;
}

export function getPaletteColors(palette: string): RGB[] | null {
  if (palette === "nes") return PALETTE_COLORS.nes;
  if (palette === "gameboy") return PALETTE_COLORS.gameboy;
  return null;
}

export function paletteColorCount(palette: string): number {
  if (palette === "nes") return 25;
  if (palette === "gameboy") return 4;
  return parseInt(palette, 10);
}
