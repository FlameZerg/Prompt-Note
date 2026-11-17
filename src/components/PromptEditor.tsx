import { useState, type FormEvent } from 'react';
import { ArrowUpRight } from 'lucide-react';
import Dialog from './Dialog';
import { parseTags, validatePrompt } from '../utils/library';
import type { Category, Prompt, PromptInput } from '../types';
import type { Messages } from '../locales/zh';
interface Props {
  prompt: Prompt | null; categoryId: string; categories: Category[]; t: Messages;
  onClose: () => void; onSave: (input: PromptInput) => Promise<boolean>;
}
export default function PromptEditor({ prompt, categoryId, categories, t, onClose, onSave }: Props) {
  const [content, setContent] = useState(prompt?.content ?? '');
  const [tags, setTags] = useState(prompt?.tags.map(tag => tag.name).join(', ') ?? '');
  const [selected, setSelected] = useState([prompt?.categoryId ?? categoryId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const input: PromptInput = { id: prompt?.id ?? null, content, tags: parseTags(tags), categoryIds: selected };
    const issue = validatePrompt(input);
    if (issue) { setError(t[issue]); return; }
    setBusy(true);
    setError('');
    try { if (!await onSave(input)) setError(t.error); }
    finally { setBusy(false); }
  }
  return <Dialog heading={prompt ? t.edit : t.newPrompt} closeLabel={t.close} busy={busy} onClose={onClose}>
    <form onSubmit={event => { void submit(event); }} className="editor-form">
      <div className="field"><label htmlFor="prompt-content">{t.content}<span className="field-count">{content.length.toLocaleString()}</span></label>
        <textarea id="prompt-content" autoFocus value={content} onChange={event => setContent(event.target.value)}
          placeholder={t.contentPlaceholder} rows={8} required aria-describedby={error ? 'editor-error' : undefined} />
      </div>
      <div className="field"><label htmlFor="prompt-tags">{t.tags}</label>
        <input id="prompt-tags" value={tags} onChange={event => setTags(event.target.value)} placeholder={t.tagsPlaceholder} aria-describedby="tags-help" />
        <small id="tags-help">{t.tagsHint}</small>
      </div>
      <fieldset className="field"><legend>{t.categories}</legend>
        <div className="category-choices">{categories.map(category => <label key={category.id} className={`category-choice ${selected.includes(category.id) ? 'selected' : ''}`}>
          <input type="checkbox" checked={selected.includes(category.id)}
            onChange={event => setSelected(ids => event.target.checked ? [...ids, category.id] : ids.filter(id => id !== category.id))} />
          <span>{category.id === 'general' ? t.general : category.name}</span>
        </label>)}</div>
      </fieldset>
      {error && <p id="editor-error" className="form-error" role="alert">{error}</p>}
      <footer className="dialog-footer"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>{t.cancel}</button>
        <button className="button primary" disabled={busy}>{busy ? t.saving : t.save}<ArrowUpRight size={17} aria-hidden="true" /></button>
      </footer>
    </form>
  </Dialog>;
}
