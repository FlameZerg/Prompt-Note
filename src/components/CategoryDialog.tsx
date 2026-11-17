import { useState, type FormEvent } from 'react';
import Dialog from './Dialog';
import type { Category } from '../types';
import type { Messages } from '../locales/zh';
interface Props {
  category: Category | null; categories: Category[]; t: Messages;
  onSave: (name: string) => Promise<boolean>; onClose: () => void;
}
export default function CategoryDialog({ category, categories, t, onSave, onClose }: Props) {
  const [name, setName] = useState(category?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = name.trim();
    if (!value || Array.from(value).length > 80) { setError(t.nameRequired); return; }
    if (categories.some(item => item.id !== category?.id && item.name.toLocaleLowerCase() === value.toLocaleLowerCase())) { setError(t.duplicateCategory); return; }
    setBusy(true);
    try { if (await onSave(value)) onClose(); else setError(t.error); } finally { setBusy(false); }
  }
  return <Dialog heading={category ? t.renameCategory : t.newCategory} closeLabel={t.close} onClose={onClose} busy={busy}>
    <form className="editor-form" onSubmit={event => { void submit(event); }}>
      <div className="field"><label htmlFor="category-name">{t.categoryName}</label>
        <input id="category-name" value={name} onChange={event => setName(event.target.value)} autoFocus required placeholder={t.categoryPlaceholder} aria-describedby={error ? 'category-error' : undefined} />
      </div>
      {error && <p className="form-error" id="category-error" role="alert">{error}</p>}
      <footer className="dialog-footer"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>{t.cancel}</button><button className="button primary" disabled={busy}>{busy ? t.saving : category ? t.renameCategory : t.newCategory}</button></footer>
    </form>
  </Dialog>;
}
