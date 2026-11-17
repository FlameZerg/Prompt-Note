import { useEffect, useLayoutEffect, useState } from 'react';
import { clampZoom } from '../utils/library';
import { parsePalette } from '../utils/appearance';
import type { Language, Theme, ViewMode } from '../types';
import { useToast } from './useToast';
import zh from '../locales/zh';
import en from '../locales/en';

// 偏好只保存无敏感数据的小标量，存储异常保持可观测，不隐藏错误。
function read(key: string): string | null {
  try { return localStorage.getItem(key); }
  catch (error) { console.error('读取偏好失败：', error); return null; }
}
export function usePreferences() {
  const [language, setLanguage] = useState<Language>(() => read('language') === 'en' ? 'en' : 'zh');
  const [view, setView] = useState<ViewMode>(() => read('view') === 'list' ? 'list' : 'grid');
  const [theme, setTheme] = useState<Theme>(() => read('theme') === 'dark' ? 'dark' : 'light');
  const [palette, setPalette] = useState(() => parsePalette(read('palette')));
  const [zoom, setZoom] = useState(() => clampZoom(Number(read('zoom') ?? 1)));
  const notify = useToast();
  // React 绘制前应用主题，避免切换时内容区与表单短暂使用不同配色。
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.palette = palette;
  }, [theme, palette]);
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    try {
      localStorage.setItem('language', language);
      localStorage.setItem('view', view);
      localStorage.setItem('theme', theme);
      localStorage.setItem('palette', palette);
      localStorage.setItem('zoom', String(zoom));
    } catch (error) { console.error('保存偏好失败：', error); notify((language === 'zh' ? zh : en).storageError, 'error'); }
  }, [language, view, theme, palette, zoom, notify]);
  useEffect(() => {
    // 非被动监听阻止浏览器再次缩放；CSS zoom 负责重排而非视觉裁剪。
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      setZoom(value => clampZoom(value + (event.deltaY < 0 ? 0.1 : -0.1)));
    };
    window.addEventListener('wheel', wheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', wheel, { capture: true });
  }, []);
  return { language, setLanguage, view, setView, theme, setTheme, palette, setPalette, zoom, setZoom };
}
