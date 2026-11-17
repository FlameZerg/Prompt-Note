import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
interface Props { heading: string; closeLabel: string; onClose: () => void; children: ReactNode; busy?: boolean }
export default function Dialog({ heading, closeLabel, onClose, children, busy = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return <dialog ref={ref} className="dialog" aria-labelledby="dialog-heading"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="dialog-header"><h2 id="dialog-heading">{heading}</h2>
      <button className="icon-button" disabled={busy} aria-label={closeLabel} onClick={onClose}><X size={20} /></button>
    </header>
    {children}
  </dialog>;
}
