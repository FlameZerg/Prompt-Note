// 仅由 browser-harness 的测试插件注入，不参与正式构建。
import type { Category, Prompt } from '../../src/types';
type Action = { kind: string; id?: string; content?: string; tags?: string[]; categoryIds?: string[]; categoryId?: string; ids?: string[]; name?: string };
const categories: Category[] = [
  { id: 'general', name: 'General', position: 0 },
  { id: 'design', name: '产品设计', position: 1 },
  { id: 'writing', name: 'Writing studio', position: 2 },
];
const texts = [
  '请作为一位经验丰富的产品设计师，帮助我分析以下需求。\n\n从用户目标、核心路径和潜在障碍三个维度展开，给出简洁、可执行的建议。保持清晰，不要堆砌术语。',
  'Review the following code for correctness, readability, and security.\n\nExplain the most important issue first. Suggest the smallest safe change, and describe how to verify it.',
  '将以下内容整理成一份清晰的会议纪要，保留关键决策、负责人和后续行动。\n\n不要补充原文中不存在的信息。',
  'You are a thoughtful writing partner. Rewrite the following paragraph with a clear structure and a natural voice. Keep the original meaning.',
];
const promptCount = (window as Window & { __promptCount?: number }).__promptCount ?? 27;
const prompts: Prompt[] = Array.from({ length: promptCount }, (_, index) => ({
  id: `prompt-${index}`, categoryId: 'general', position: index, content: texts[index % texts.length],
  tags: [{ id: `tag-${index % 4}`, name: ['产品设计', 'Code review', '效率工具', 'Writing'][index % 4], color: '#14786a' }],
  isFavorite: index % 3 === 0, dateCreated: '2026-11-15T08:00:00Z', dateModified: '2026-11-15T08:00:00Z',
}));
const bridge = {
  library: { categories, prompts },
  clipboard: '', copies: 0, mutations: 0, tray: null as unknown, fail: '',
  // 精确延迟一次初始读取，复现 StrictMode 旧请求晚于保存返回的竞态。
  holdNextRead: (window as Window & { __holdInitialRead?: boolean }).__holdInitialRead === true,
  pendingReads: [] as ((fail?: boolean) => void)[],
  unlistenCalls: 0,
  listeners: new Map<string, Set<(event: { payload: string }) => void>>(),
  emit(name: string, payload: string) { bridge.listeners.get(name)?.forEach(callback => callback({ payload })); },
};
Object.assign(window, { __testBridge: bridge });
export const isTauri = () => true;
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (bridge.fail === command) throw new Error(`测试注入失败：${command}`);
  if (command === 'get_library') {
    const snapshot = structuredClone(bridge.library) as T;
    if (bridge.holdNextRead) {
      bridge.holdNextRead = false;
      return new Promise<T>((resolve, reject) => bridge.pendingReads.push((fail = false) => {
        if (fail) reject(new Error('测试注入：失效的旧读取失败'));
        else resolve(snapshot);
      }));
    }
    return snapshot;
  }
  if (command === 'update_tray_menu') { bridge.tray = args; return undefined as T; }
  if (command === 'copy_prompt') {
    if (bridge.fail === 'clipboard') throw new Error('测试剪贴板拒绝');
    const prompt = bridge.library.prompts.find(prompt => prompt.id === args?.id);
    if (!prompt) throw new Error('测试提示词不存在');
    bridge.clipboard = prompt.content;
    bridge.copies++;
    const historySaved = bridge.fail !== 'history';
    if (historySaved) bridge.mutations++;
    return { historySaved } as T;
  }
  if (command !== 'mutate_library') throw new Error(`未实现的测试命令：${command}`);
  const action = args?.action as Action;
  bridge.mutations++;
  if (action.kind === 'saveCategory') {
    const next = action.id ? bridge.library.categories.map(category => category.id === action.id ? { ...category, name: action.name! } : category)
      : [...bridge.library.categories, { id: crypto.randomUUID(), name: action.name!, position: bridge.library.categories.length }];
    bridge.library = { ...bridge.library, categories: next };
  } else if (action.kind === 'deleteCategory') {
    if (action.id === 'general' || !bridge.library.categories.some(category => category.id === action.id)) {
      throw new Error('默认分类不可删除或分类不存在');
    }
    bridge.library = { ...bridge.library,
      categories: bridge.library.categories.filter(category => category.id !== action.id),
      prompts: bridge.library.prompts.filter(prompt => prompt.categoryId !== action.id) };
  } else if (action.kind === 'toggleFavorite') {
    bridge.library = { ...bridge.library, prompts: bridge.library.prompts.map(prompt => prompt.id === action.id ? { ...prompt, isFavorite: !prompt.isFavorite } : prompt) };
  } else if (action.kind === 'deletePrompt') {
    bridge.library = { ...bridge.library, prompts: bridge.library.prompts.filter(prompt => prompt.id !== action.id) };
  } else if (action.kind === 'reorder') {
    bridge.library = { ...bridge.library, prompts: bridge.library.prompts.map(prompt => prompt.categoryId === action.categoryId ? { ...prompt, position: action.ids!.indexOf(prompt.id) } : prompt) };
  } else if (action.kind === 'savePrompt') {
    const original = bridge.library.prompts.find(prompt => prompt.id === action.id);
    const primary = action.categoryIds!.includes(original?.categoryId ?? '') ? original!.categoryId : action.categoryIds![0];
    const next = action.categoryIds!.map(categoryId => ({
      id: categoryId === primary && original ? original.id : crypto.randomUUID(),
      categoryId, content: action.content!, position: original?.position ?? bridge.library.prompts.length,
      tags: action.tags!.map(name => ({ id: name, name, color: '#14786a' })), isFavorite: original?.isFavorite ?? false,
      dateCreated: '2026-11-15T08:00:00Z', dateModified: '2026-11-15T08:00:00Z',
    }));
    bridge.library = { ...bridge.library, prompts: [...bridge.library.prompts.filter(prompt => prompt.id !== action.id), ...next] };
  } else throw new Error(`未实现的测试变更：${action.kind}`);
  return undefined as T;
}
export async function listen<T>(name: string, callback: (event: { payload: T }) => void): Promise<() => void> {
  const listener = callback as (event: { payload: string }) => void;
  const listeners = bridge.listeners.get(name) ?? new Set();
  listeners.add(listener);
  bridge.listeners.set(name, listeners);
  return () => { bridge.unlistenCalls++; listeners.delete(listener); };
}
