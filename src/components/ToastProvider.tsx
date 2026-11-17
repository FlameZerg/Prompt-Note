import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CircleAlert, Info, X } from 'lucide-react';
import { ToastContext, type ToastKind } from '../hooks/useToast';
interface Toast { id: number; message: string; kind: ToastKind }

// 无依赖的轻量反馈模块，限制可见数量并在卸载时清理全部定时器。
export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sequence = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts(items => items.filter(item => item.id !== id));
  }, []);
  const notify = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++sequence.current;
    setToasts(items => [...items.slice(-3), { id, message, kind }]);
    if (kind !== 'error') timers.current.set(id, setTimeout(() => dismiss(id), 3600));
  }, [dismiss]);
  useEffect(() => {
    const activeTimers = timers.current;
    return () => activeTimers.forEach(clearTimeout);
  }, []);
  return <ToastContext.Provider value={notify}>
    {children}
    <div className="toast-stack" aria-live="polite" aria-relevant="additions">
      {toasts.map(toast => {
        const Icon = toast.kind === 'success' ? Check : toast.kind === 'error' ? CircleAlert : Info;
        return <div key={toast.id} className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <Icon size={18} aria-hidden="true" /><span>{toast.message}</span>
          <button className="icon-button" aria-label="关闭 / Dismiss" onClick={() => dismiss(toast.id)}><X size={16} /></button>
        </div>;
      })}
    </div>
  </ToastContext.Provider>;
}
