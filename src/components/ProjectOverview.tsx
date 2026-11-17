import { ArrowUpRight, Folder, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Category, Library } from '../types';
import type { Messages } from '../locales/zh';
import { useMemo } from 'react';
import { groupPromptsByCategory } from '../utils/library';
export default function ProjectOverview({ library, search, t, busy, onOpen, onNew, onEdit, onDelete }: {
  library: Library; search: string; t: Messages; busy: boolean;
  onOpen: (id: string) => void; onNew: () => void;
  onEdit: (category: Category) => void; onDelete: (category: Category) => void;
}) {
  const promptsByCategory = useMemo(() => groupPromptsByCategory(library.prompts), [library.prompts]);
  const categories = library.categories.filter(category => (category.id === 'general' ? t.general : category.name).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <div className="projects-grid">
    {categories.map(category => {
      const prompts = promptsByCategory.get(category.id) ?? [];
      const tags = [...new Set(prompts.flatMap(prompt => prompt.tags.map(tag => tag.name)))].slice(0, 4);
      return <article className="project-card" key={category.id}>
        <button className="project-open" onClick={() => onOpen(category.id)}>
          <div className="project-symbol"><Folder size={24} aria-hidden="true" /><ArrowUpRight size={19} aria-hidden="true" /></div>
          <h2>{category.id === 'general' ? t.general : category.name}</h2>
          <span className="project-count">{prompts.length} {t.prompts}</span>
          <div className="project-tags">{tags.length ? tags.map(tag => <span key={tag}>{tag}</span>) : <span>{t.emptyHint}</span>}</div>
        </button>
        {category.id !== 'general' && <div className="project-actions">
          <button className="text-button" disabled={busy} onClick={() => onEdit(category)}><Pencil size={15} aria-hidden="true" />{t.edit}</button>
          <button className="text-button danger" disabled={busy} title={t.deleteCategoryHint} onClick={() => onDelete(category)}><Trash2 size={15} aria-hidden="true" />{t.delete}</button>
        </div>}
      </article>;
    })}
    {!categories.length && <p className="empty-results">{t.noResults}</p>}
    <button className="project-add" onClick={onNew}><Plus size={24} aria-hidden="true" /><span>{t.newCategory}</span></button>
  </div>;
}
