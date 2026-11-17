import { ArrowUpRight, Folder, FolderOpen, Languages, LayoutDashboard, Moon, Plus, Settings, Sun } from 'lucide-react';
import type { Library, Language, Theme } from '../types';
import type { Messages } from '../locales/zh';
import { useMemo } from 'react';
import { groupPromptsByCategory } from '../utils/library';
interface Props {
  library: Library; categoryId: string | null; language: Language; theme: Theme; t: Messages;
  onSelect: (id: string | null) => void; onNew: () => void; onCategory: () => void;
  onLanguage: () => void; onTheme: () => void; onSettings: () => void;
}
export default function Sidebar({ library, categoryId, language, theme, t, onSelect, onNew, onCategory, onLanguage, onTheme, onSettings }: Props) {
  const promptsByCategory = useMemo(() => groupPromptsByCategory(library.prompts), [library.prompts]);
  const ThemeIcon = theme === 'light' ? Sun : Moon;
  const themeAction = theme === 'light' ? t.switchToDarkTheme : t.switchToLightTheme;
  return <aside className="sidebar">
    <a href="#workspace" aria-label="Prompt Note" className="brand" onClick={event => { event.preventDefault(); onSelect(null); }}>
      <span className="brand-mark"><img src="/mark.svg" alt="" width={38} height={38} /></span><span>Prompt Note<small>{t.brandDescription}</small></span>
    </a>
    <button className="button sidebar-create" aria-label={t.newPrompt} title={t.newPrompt} onClick={onNew}><Plus size={18} aria-hidden="true" /><span>{t.newPrompt}</span><ArrowUpRight size={16} aria-hidden="true" /></button>
    <nav aria-label={t.workspace}>
      <button className={`nav-item ${categoryId === null ? 'active' : ''}`} aria-label={t.allProjects} title={t.allProjects} onClick={() => onSelect(null)} aria-current={categoryId === null ? 'page' : undefined}>
        <LayoutDashboard size={18} aria-hidden="true" /><span>{t.allProjects}</span><span className="nav-count">{library.categories.length}</span>
      </button>
      <div className="nav-section"><span>{t.projects}</span><button className="icon-button" aria-label={t.newCategory} onClick={onCategory}><Plus size={17} /></button></div>
      <div className="project-nav">{library.categories.map(category => {
        const Icon = category.id === categoryId ? FolderOpen : Folder;
        return <button key={category.id} className={`nav-item ${category.id === categoryId ? 'active' : ''}`}
          onClick={() => onSelect(category.id)} aria-label={category.id === 'general' ? t.general : category.name} title={category.id === 'general' ? t.general : category.name} aria-current={category.id === categoryId ? 'page' : undefined}>
          <Icon size={18} aria-hidden="true" /><span>{category.id === 'general' ? t.general : category.name}</span>
          <span className="nav-count">{promptsByCategory.get(category.id)?.length ?? 0}</span>
        </button>;
      })}</div>
    </nav>
    <footer className="sidebar-footer">
      <button className="nav-item" onClick={onTheme} aria-label={themeAction} title={themeAction}>
        <ThemeIcon size={18} aria-hidden="true" /><span>{theme === 'light' ? t.lightTheme : t.darkTheme}</span>
      </button>
      {/* 文字与代码均表示当前语言，操作名称明确指出切换目标。 */}
      <button className="nav-item" onClick={onLanguage} aria-label={language === 'zh' ? 'Switch to English' : '切换为中文'} title={language === 'zh' ? 'Switch to English' : '切换为中文'}><Languages size={18} aria-hidden="true" /><span>{language === 'zh' ? '中文' : 'English'}</span><span className="language-code">{language.toUpperCase()}</span></button>
      <button className="nav-item" onClick={onSettings} aria-label={t.settings} title={t.settings}><Settings size={18} aria-hidden="true" /><span>{t.settings}</span></button>
    </footer>
  </aside>;
}
