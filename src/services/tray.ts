import { invoke } from '@tauri-apps/api/core';
import type { Library } from '../types';
import type { Messages } from '../locales/zh';
import { groupPromptsByCategory } from '../utils/library';

// 托盘完整覆盖全部分类，仅显示标签；同名条目仍通过不同 ID 复制。
export function syncTray(library: Library, t: Messages): Promise<void> {
  const promptsByCategory = groupPromptsByCategory(library.prompts);
  const groups = library.categories.map(category => ({
    id: category.id, name: category.id === 'general' ? t.general : category.name,
    prompts: (promptsByCategory.get(category.id) ?? [])
      .toSorted((a, b) => a.position - b.position || b.dateCreated.localeCompare(a.dateCreated))
      .map(prompt => ({
        id: prompt.id,
        label: prompt.tags.map(tag => tag.name).join(' · ') || t.noTags,
      })),
  }));
  return invoke('update_tray_menu', {
    // 旧设置入口已删除，不允许历史存储值在后台继续触发自动粘贴。
    groups, autoInsert: false, labels: { showWindow: t.showWindow, quit: t.quit, empty: t.empty, more: t.more },
  });
}
