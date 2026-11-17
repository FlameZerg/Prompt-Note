import { Columns2, List, Plus, Search, Star, X } from 'lucide-react';
import type { Messages } from '../locales/zh';
import type { ViewMode } from '../types';
export default function WorkspaceToolbar({ overview, search, setSearch, favorites, setFavorites, view, setView, count, t, onNew }: {
  overview: boolean; search: string; setSearch: (value: string) => void; favorites: boolean;
  setFavorites: (value: boolean) => void; view: ViewMode; setView: (value: ViewMode) => void;
  count: number; t: Messages; onNew: () => void;
}) {
  return <div className="workspace-toolbar">
    <div className="search-field"><Search size={18} aria-hidden="true" />
      <input type="search" aria-label={overview ? t.searchProjects : t.search} placeholder={overview ? t.searchProjects : t.search} value={search} onChange={event => setSearch(event.target.value)} />
      {search && <button className="icon-button" aria-label={t.clearSearch} onClick={() => setSearch('')}><X size={16} /></button>}
    </div>
    <div className="toolbar-controls">
      {!overview && <><button className={`button favorite-filter ${favorites ? 'selected' : ''}`} aria-pressed={favorites} onClick={() => setFavorites(!favorites)}><Star size={16} aria-hidden="true" />{t.favorites}</button>
        <div className="view-toggle" role="group" aria-label={`${t.grid} / ${t.list}`}>
          <button className={view === 'grid' ? 'selected' : ''} aria-label={t.grid} aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Columns2 size={18} /></button>
          <button className={view === 'list' ? 'selected' : ''} aria-label={t.list} aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={18} /></button>
        </div></>}
      <span className="result-count">{count} {overview ? t.totalProjects : t.prompts}</span>
      <button className="button primary mobile-create" onClick={onNew}><Plus size={17} aria-hidden="true" />{overview ? t.newCategory : t.newPrompt}</button>
    </div>
  </div>;
}
