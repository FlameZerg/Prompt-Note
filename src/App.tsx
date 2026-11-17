import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { listen } from '@tauri-apps/api/event';
import { ArrowLeft, CircleAlert, FolderOpen, Minus, Plus, RefreshCw, Sparkles } from 'lucide-react';
import Sidebar from './components/Sidebar';
import PromptCard from './components/PromptCard';
import PromptEditor from './components/PromptEditor';
import ProjectOverview from './components/ProjectOverview';
import WorkspaceToolbar from './components/WorkspaceToolbar';
import CategoryDialog from './components/CategoryDialog';
import Dialog from './components/Dialog';
import Settings from './components/Settings';
import { useLibrary } from './hooks/useLibrary';
import { usePreferences } from './hooks/usePreferences';
import { useToast } from './hooks/useToast';
import { syncTray } from './services/tray';
import { copyPrompt } from './services/db';
import { categoryName, clampZoom, filterPrompts, reorderIds } from './utils/library';
import zh from './locales/zh';
import en from './locales/en';
import type { Category, Prompt, PromptInput } from './types';

export default function App() {
  const prefs = usePreferences();
  const t = prefs.language === 'zh' ? zh : en;
  const notify = useToast();
  const { library, loading, loadError, busy, reload, commit } = useLibrary(t);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState(false);
  const [editor, setEditor] = useState<{ prompt: Prompt | null } | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<{ category: Category | null } | null>(null);
  const [deletion, setDeletion] = useState<{ kind: 'prompt' | 'category'; id: string } | null>(null);
  const [settings, setSettings] = useState(false);
  const trayQueue = useRef(Promise.resolve());
  const visible = categoryId ? filterPrompts(library.prompts, categoryId, search, favorites) : [];
  const allInCategory = categoryId ? filterPrompts(library.prompts, categoryId, '', false) : [];

  useEffect(() => {
    let disposed = false;
    const pending = listen<string>('tray-feedback', event => {
      const messages = { copiedTray: t.copiedTray, copyFailed: t.copyFailed, copiedHistoryFailed: t.copiedHistoryFailed, pasteFailed: t.pasteFailed };
      // 事件只接受自身定义的状态，拒绝原型属性被当作 React 文案。
      if (Object.hasOwn(messages, event.payload)) {
        notify(messages[event.payload as keyof typeof messages], event.payload === 'copiedTray' ? 'success' : 'error');
      }
    });
    // 统一由清理函数注销，避免订阅异步完成时重复调用同一个 unlisten。
    void pending.catch((error: unknown) => {
      console.error('监听托盘反馈失败：', error); if (!disposed) notify(t.traySyncFailed, 'error');
    });
    return () => { disposed = true; void pending.then(unlisten => unlisten()).catch(() => { /* 上方已报告监听错误。 */ }); };
  }, [t, notify]);
  useEffect(() => {
    if (!library.categories.length || loadError) return;
    // 串行更新避免快速切换语言与连续编辑时旧菜单覆盖新菜单。
    trayQueue.current = trayQueue.current.then(() => syncTray(library, t)).catch((error: unknown) => {
      console.error('同步托盘失败：', error); notify(t.traySyncFailed, 'error');
    });
  }, [library, t, loadError, notify]);

  function selectCategory(id: string | null) {
    // 分类切换统一回到开头，兼容常规卡片滚动与短窗口整区滚动。
    document.getElementById('workspace')?.scrollTo({ top: 0 });
    document.querySelector('.content-scroll')?.scrollTo({ top: 0 });
    setCategoryId(id); setSearch(''); setFavorites(false);
  }
  async function copy(prompt: Prompt) {
    try {
      const { historySaved } = await copyPrompt(prompt.id);
      notify(historySaved ? t.copied : t.copiedHistoryFailed, historySaved ? 'success' : 'error');
    } catch (error) { console.error('复制提示词失败：', error); notify(t.copyFailed, 'error'); }
  }
  async function save(input: PromptInput): Promise<boolean> {
    const success = await commit({ kind: 'savePrompt', ...input }, t.saved);
    if (success) { setEditor(null); if (!categoryId) selectCategory(input.categoryIds[0]); }
    return success;
  }
  function move(source: string, target: string) {
    if (!categoryId || busy) return;
    const ids = allInCategory.map(prompt => prompt.id);
    const ordered = reorderIds(ids, source, target);
    if (ordered.every((id, index) => id === ids[index])) return;
    void commit({ kind: 'reorder', categoryId, ids: ordered }, t.reordered);
  }
  async function confirmDelete() {
    if (!deletion) return;
    const success = await commit({ kind: deletion.kind === 'prompt' ? 'deletePrompt' : 'deleteCategory', id: deletion.id }, deletion.kind === 'prompt' ? t.deleted : t.categoryDeleted);
    if (success) setDeletion(null);
  }
  const overview = categoryId === null;
  const pageStyle: CSSProperties & { '--page-zoom': number } = { zoom: prefs.zoom, height: `${100 / prefs.zoom}dvh`, '--page-zoom': prefs.zoom };
  return <div className="app-shell" style={pageStyle}>
    <Sidebar library={library} categoryId={categoryId} t={t} language={prefs.language} theme={prefs.theme}
      onTheme={() => prefs.setTheme(value => value === 'light' ? 'dark' : 'light')}
      onSelect={selectCategory} onNew={() => setEditor({ prompt: null })} onCategory={() => setCategoryEditor({ category: null })}
      onLanguage={() => {
        const language = prefs.language === 'zh' ? 'en' : 'zh';
        prefs.setLanguage(language); notify(language === 'zh' ? zh.languageChanged : en.languageChanged);
      }} onSettings={() => setSettings(true)} />
    <main className="workspace" id="workspace">
      <header className="workspace-header">
        <div className="breadcrumb"><FolderOpen size={16} aria-hidden="true" /><span>Prompt Note</span><span>/</span><span>{overview ? t.workspace : t.projects}</span></div>
        <div className="heading-row"><div>
          {!overview && <button className="text-button back-button" onClick={() => selectCategory(null)}><ArrowLeft size={15} aria-hidden="true" />{t.back}</button>}
          <h1>{overview ? t.allProjects : categoryName(library, categoryId, t.general)}</h1>
          <p>{overview ? t.projectHint : t.libraryHint}</p>
        </div>
          <button className="button primary desktop-create" disabled={loading || loadError} onClick={() => overview ? setCategoryEditor({ category: null }) : setEditor({ prompt: null })}>
            <Plus size={18} aria-hidden="true" />{overview ? t.newCategory : t.newPrompt}
          </button>
        </div>
      </header>
      <WorkspaceToolbar overview={overview} search={search} setSearch={setSearch} favorites={favorites} setFavorites={setFavorites}
        view={prefs.view} setView={prefs.setView} count={overview ? library.categories.length : visible.length} t={t}
        onNew={() => overview ? setCategoryEditor({ category: null }) : setEditor({ prompt: null })} />
      <section className="content-scroll" aria-busy={loading} aria-label={overview ? t.projects : t.allPrompts}>
        {loading ? <div className="empty-state" role="status"><RefreshCw size={27} className="loading-icon" /><p>{t.loading}</p></div>
          : loadError ? <div className="empty-state" role="alert"><CircleAlert size={32} /><h2>{t.loadError}</h2><button className="button primary" onClick={() => { void reload(); }}><RefreshCw size={17} />{t.retry}</button></div>
          : overview ? <ProjectOverview library={library} search={search} t={t} busy={busy}
            onOpen={selectCategory} onNew={() => setCategoryEditor({ category: null })} onEdit={category => setCategoryEditor({ category })}
            onDelete={category => setDeletion({ kind: 'category', id: category.id })} />
          : !visible.length ? <div className="empty-state"><span className="empty-symbol"><Sparkles size={32} aria-hidden="true" /></span>
            <h2>{search ? t.noResults : favorites ? t.noFavorites : t.empty}</h2>
            <p>{search ? t.noResultsHint : favorites ? t.noFavoritesHint : t.emptyHint}</p>
            <button className="button primary" onClick={() => search || favorites ? (setSearch(''), setFavorites(false)) : setEditor({ prompt: null })}>
              <Plus size={17} aria-hidden="true" />{search || favorites ? t.allPrompts : t.newPrompt}
            </button>
          </div> : <div className={`prompt-collection ${prefs.view}`}>
            {visible.map(prompt => <PromptCard key={prompt.id} prompt={prompt} t={t} language={prefs.language} busy={busy}
              onCopy={value => { void copy(value); }} onEdit={value => setEditor({ prompt: value })} onDelete={value => setDeletion({ kind: 'prompt', id: value.id })}
              onFavorite={value => { void commit({ kind: 'toggleFavorite', id: value.id }, value.isFavorite ? t.unfavorited : t.favorited); }} onMove={move} />)}
          </div>}
      </section>
      <footer className="workspace-footer">
        <div className="zoom-controls" role="group" aria-label={t.zoom} title={t.zoomHint}>
          <button className="icon-button" aria-label={t.zoomOut} disabled={prefs.zoom <= 0.5} onClick={() => prefs.setZoom(clampZoom(prefs.zoom - 0.1))}><Minus size={14} /></button>
          <button className="zoom-value" onClick={() => prefs.setZoom(1)} aria-label={t.resetZoom}>{Math.round(prefs.zoom * 100)}%</button>
          <button className="icon-button" aria-label={t.zoomIn} disabled={prefs.zoom >= 2} onClick={() => prefs.setZoom(clampZoom(prefs.zoom + 0.1))}><Plus size={14} /></button>
        </div>
      </footer>
    </main>
    {editor && !loading && !loadError && <PromptEditor prompt={editor.prompt} categoryId={categoryId ?? 'general'} categories={library.categories} t={t} onClose={() => setEditor(null)} onSave={save} />}
    {categoryEditor && <CategoryDialog category={categoryEditor.category} categories={library.categories} t={t} onClose={() => setCategoryEditor(null)}
      onSave={name => commit({ kind: 'saveCategory', id: categoryEditor.category?.id ?? null, name }, categoryEditor.category ? t.categoryRenamed : t.categoryCreated)} />}
    {deletion && <Dialog heading={deletion.kind === 'prompt' ? t.deletePrompt : t.deleteCategory} closeLabel={t.close} busy={busy} onClose={() => setDeletion(null)}>
      <div className="editor-form"><p className="dialog-description">{deletion.kind === 'prompt' ? t.deletePromptHint : t.deleteCategoryHint}</p>
        <footer className="dialog-footer"><button className="button secondary" disabled={busy} onClick={() => setDeletion(null)}>{t.cancel}</button>
          <button className="button destructive" disabled={busy} onClick={() => { void confirmDelete(); }}>{busy ? t.saving : t.confirmDelete}</button></footer>
      </div>
    </Dialog>}
    {settings && <Settings palette={prefs.palette} t={t} onClose={() => setSettings(false)} onPalette={prefs.setPalette} />}
  </div>;
}
