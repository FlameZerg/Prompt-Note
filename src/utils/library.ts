import type { Library, Prompt, PromptInput } from '../types/index';

// 单一验证入口同时服务表单与测试；后端仍会独立验证边界。
export function validatePrompt(input: PromptInput): 'contentRequired' | 'categoryRequired' | 'tagsInvalid' | null {
  if (!input.content.trim() || Array.from(input.content).length > 100_000) return 'contentRequired';
  if (!input.categoryIds.length) return 'categoryRequired';
  // 标签不限制字数，仅保留数量与非空校验，与原生写入边界一致。
  if (input.tags.length > 20 || input.tags.some(tag => !tag.trim())) return 'tagsInvalid';
  return null;
}
export function parseTags(text: string): string[] {
  return [...new Set(text.split(/[,，\n]/).map(tag => tag.trim()).filter(Boolean))];
}
// 侧栏、项目概览及托盘共用分组；一次遍历替代每个分类重复筛选全库。
export function groupPromptsByCategory(prompts: Prompt[]): Map<string, Prompt[]> {
  const groups = new Map<string, Prompt[]>();
  for (const prompt of prompts) {
    const group = groups.get(prompt.categoryId);
    if (group) group.push(prompt);
    else groups.set(prompt.categoryId, [prompt]);
  }
  return groups;
}
export function filterPrompts(prompts: Prompt[], categoryId: string, search: string, favorites: boolean): Prompt[] {
  const term = search.trim().toLocaleLowerCase();
  return prompts.filter(prompt => prompt.categoryId === categoryId
    && (!favorites || prompt.isFavorite)
    && (!term || [prompt.content, ...prompt.tags.map(tag => tag.name)].some(text => text.toLocaleLowerCase().includes(term))))
    .toSorted((a, b) => a.position - b.position || b.dateCreated.localeCompare(a.dateCreated));
}
export function reorderIds(ids: string[], source: string, target: string): string[] {
  const from = ids.indexOf(source);
  const to = ids.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...ids];
  const remaining = ids.filter(id => id !== source);
  return [...remaining.slice(0, to), source, ...remaining.slice(to)];
}
export function categoryName(library: Library, id: string, general: string): string {
  return id === 'general' ? general : library.categories.find(category => category.id === id)?.name ?? '';
}
export function clampZoom(value: number): number {
  return Number.isFinite(value) ? Math.min(2, Math.max(0.5, Math.round(value * 10) / 10)) : 1;
}
