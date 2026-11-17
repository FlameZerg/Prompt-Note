import { useCallback, useEffect, useRef, useState } from 'react';
import { getLibrary, mutate } from '../services/db';
import { useToast } from './useToast';
import type { Library, LibraryAction } from '../types';
import type { Messages } from '../locales/zh';

export function useLibrary(t: Messages) {
  const [library, setLibrary] = useState<Library>({ prompts: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const committing = useRef(false);
  // 只接受最新读取结果，防止旧的初始化请求覆盖已提交的数据。
  const readVersion = useRef(0);
  const notify = useToast();
  const refresh = useCallback((isCancelled: () => boolean = () => false) => {
    const version = ++readVersion.current;
    const isCurrent = () => !isCancelled() && version === readVersion.current;
    // 状态仅由真实数据库请求的完成回调更新，effect 本身不触发同步渲染。
    return getLibrary().then(data => {
      if (isCurrent()) {
        setLibrary(data);
        setLoadError(false);
      }
    }).catch((error: unknown) => {
      console.error('加载本地数据失败：', error);
      if (isCurrent()) setLoadError(true);
    }).finally(() => { if (isCurrent()) setLoading(false); });
  }, []);
  const reload = async () => { setLoading(true); await refresh(); };
  useEffect(() => {
    let cancelled = false;
    void refresh(() => cancelled);
    // 卸载只取消本次订阅，不读取可能已变化的共享 ref。
    return () => { cancelled = true; };
  }, [refresh]);
  const commit = async (action: LibraryAction, message: string): Promise<boolean> => {
    if (committing.current) return false;
    committing.current = true;
    setBusy(true);
    try {
      await mutate(action);
      notify(message);
      // 提交成功与刷新失败分别报告，避免重试表单重复创建数据。
      const version = ++readVersion.current;
      try {
        const data = await getLibrary();
        if (version === readVersion.current) { setLibrary(data); setLoadError(false); }
      } catch (error) {
        console.error('写入后刷新失败：', error);
        if (version === readVersion.current) { setLoadError(true); notify(t.savedRefreshFailed, 'error'); }
      } finally { if (version === readVersion.current) setLoading(false); }
      return true;
    } catch (error) {
      console.error('保存操作失败：', error);
      notify(t.error, 'error');
      return false;
    } finally { committing.current = false; setBusy(false); }
  };
  return { library, loading, loadError, busy, reload, commit };
}
