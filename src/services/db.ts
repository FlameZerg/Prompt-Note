import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Library, LibraryAction } from '../types';

let pendingLibrary: Promise<Library> | null = null;
// 前端不再持有可执行任意 SQL 的连接，只调用 Rust 的固定查询和事务动作。
function requireDesktop(): void {
  if (!isTauri()) throw new Error('请在 Tauri 桌面环境打开本地数据库。');
}
export async function getLibrary(): Promise<Library> {
  requireDesktop();
  // 并发初始化共用同一次真实读取；完成后释放，不长期缓存用户数据。
  if (!pendingLibrary) {
    const request: Promise<Library> = invoke<Library>('get_library').finally(() => {
      if (pendingLibrary === request) pendingLibrary = null;
    });
    pendingLibrary = request;
  }
  return pendingLibrary;
}
export async function mutate(action: LibraryAction): Promise<void> {
  requireDesktop();
  // 写后刷新不能接回写前仍在途的读取，原 hook 的版本检查继续处理过期响应。
  pendingLibrary = null;
  try { await invoke('mutate_library', { action }); }
  finally { pendingLibrary = null; }
}
export async function copyPrompt(id: string): Promise<{ historySaved: boolean }> {
  requireDesktop();
  return invoke('copy_prompt', { id });
}
