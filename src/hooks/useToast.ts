import { createContext, useContext } from 'react';
export type ToastKind = 'success' | 'error' | 'info';
export const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {
  throw new Error('ToastProvider 未挂载。');
});
export function useToast() { return useContext(ToastContext); }
