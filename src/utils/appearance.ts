// 配色 ID 为封闭集合，存储值不能直接变成任意样式或属性。
export const palettes = ['jade', 'ocean', 'violet', 'rose', 'amber', 'slate', 'coral', 'cyan'] as const;
export type Palette = typeof palettes[number];
export function parsePalette(value: string | null): Palette {
  return palettes.find(palette => palette === value) ?? 'jade';
}
