// 类型仅描述产品数据；旧标题仅存在于不可修改的历史数据库迁移中。
export interface Tag { id: string; name: string; color: string }
export interface Category { id: string; name: string; position: number }
export interface Prompt {
  id: string;
  content: string;
  categoryId: string;
  position: number;
  tags: Tag[];
  isFavorite: boolean;
  dateCreated: string;
  dateModified: string;
}
export interface PromptInput {
  id: string | null;
  content: string;
  tags: string[];
  categoryIds: string[];
}
export interface Library { prompts: Prompt[]; categories: Category[] }
export type Language = 'zh' | 'en';
export type ViewMode = 'grid' | 'list';
export type Theme = 'light' | 'dark';
// IPC 写入为封闭联合，防止调用方遗漏字段或拼错动作名称。
export type LibraryAction =
  | ({ kind: 'savePrompt' } & PromptInput)
  | { kind: 'deletePrompt' | 'toggleFavorite' | 'deleteCategory'; id: string }
  | { kind: 'reorder'; categoryId: string; ids: string[] }
  | { kind: 'saveCategory'; id: string | null; name: string };
