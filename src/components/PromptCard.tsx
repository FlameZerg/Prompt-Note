import { Pencil, Star, Trash2 } from 'lucide-react';
import { useCardDrag } from '../hooks/useCardDrag';
import type { Prompt, Language } from '../types';
import type { Messages } from '../locales/zh';
interface Props {
  prompt: Prompt; t: Messages; language: Language; busy: boolean;
  onCopy: (prompt: Prompt) => void; onEdit: (prompt: Prompt) => void;
  onDelete: (prompt: Prompt) => void; onFavorite: (prompt: Prompt) => void;
  onMove: (source: string, target: string) => void;
}
export default function PromptCard({ prompt, t, language, busy, onCopy, onEdit, onDelete, onFavorite, onMove }: Props) {
  const { dragging, canCopy, enableKeyboardCopy, handlers } = useCardDrag(prompt.id, onMove, busy);
  const date = new Date(prompt.dateModified.endsWith('Z') ? prompt.dateModified : `${prompt.dateModified.replace(' ', 'T')}Z`);
  return <article data-prompt-id={prompt.id} className={`prompt-card ${dragging ? 'is-dragging' : ''}`}
    draggable={false} onDragStart={event => event.preventDefault()}
    {...handlers}
    onClick={event => {
      if ((event.target as HTMLElement).closest('button') || !canCopy() || busy) return;
      if (window.getSelection()?.toString()) return;
      onCopy(prompt);
    }}
    onContextMenu={event => { if (dragging) event.preventDefault(); }}>
    {/* 内二外三，沿用原内圈约 5.83 的点距；仅作提示，不限制整卡拖动。 */}
    <svg className="drag-corner" viewBox="0 0 32 32" aria-hidden="true">
      <g fill="currentColor">
        <circle cx="12" cy="7.877" r="1.4" /><circle cx="7.877" cy="12" r="1.4" />
        <circle cx="18" cy="10" r="1.4" /><circle cx="15" cy="15" r="1.4" /><circle cx="10" cy="18" r="1.4" />
      </g>
    </svg>
    <div className="card-top"><div className="tags">{prompt.tags.length ? prompt.tags.map(tag => <span className="tag" key={tag.id} title={tag.name}>{tag.name}</span>) : <span className="untagged">{t.noTags}</span>}</div></div>
    <button className="copy-surface" aria-label={`${t.copyHint}: ${prompt.content.slice(0, 70)}`} title={prompt.content} tabIndex={0}
      disabled={busy} onClick={() => { if (canCopy()) onCopy(prompt); }}
      onKeyDown={event => {
        // 仅恢复原生按钮的键盘复制，排序统一由指针拖动处理。
        if (event.key === 'Enter' || event.key === ' ') enableKeyboardCopy();
      }} />
    <p className="prompt-text">{prompt.content}</p>
    <footer className="card-footer">
      <time dateTime={prompt.dateModified} title={`${t.updated} ${date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}`}>
        {date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}
      </time>
      <div className="card-actions">
        <button className={`text-button ${prompt.isFavorite ? 'is-favorite' : ''}`} disabled={busy} aria-label={prompt.isFavorite ? t.unfavorite : t.favorite} title={prompt.isFavorite ? t.unfavorite : t.favorite} aria-pressed={prompt.isFavorite} onClick={() => onFavorite(prompt)}>
          <Star size={16} fill={prompt.isFavorite ? 'currentColor' : 'none'} aria-hidden="true" /><span>{prompt.isFavorite ? t.unfavorite : t.favorite}</span>
        </button>
        <button className="text-button" disabled={busy} aria-label={t.edit} title={t.edit} onClick={() => onEdit(prompt)}><Pencil size={16} aria-hidden="true" /><span>{t.edit}</span></button>
        <button className="text-button danger" disabled={busy} aria-label={t.delete} title={t.delete} onClick={() => onDelete(prompt)}><Trash2 size={16} aria-hidden="true" /><span>{t.delete}</span></button>
      </div>
    </footer>
  </article>;
}
