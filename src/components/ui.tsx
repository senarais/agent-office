import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, ArrowUpRight } from 'lucide-react';
import { useOfficeStore } from '../store/useOfficeStore';
import type { TaskStatus, AgentState } from '../types';

export const statusLabel = (status: TaskStatus | AgentState) => ({ todo: 'In queue', doing: 'In progress', review: 'In review', done: 'Completed', working: 'In the zone', 'needs input': 'Needs input' }[status as string] ?? status.charAt(0).toUpperCase() + status.slice(1));
export function StatusChip({ status }: { status: TaskStatus | AgentState }) { return <span className={`status-chip status-${status.replaceAll(' ', '-')}`}><i />{statusLabel(status)}</span>; }
export function Progress({ value, color }: { value: number; color?: string }) { return <div className="progress-track" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label="Task progress"><div style={{ width: `${value}%`, background: color }} /></div>; }
export function SectionHeading({ title, aside, children }: { title: string; aside?: React.ReactNode; children?: React.ReactNode }) { return <div className="section-heading"><div><h2>{title}</h2>{children}</div>{aside}</div>; }
export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) { return <div className="empty-state"><span className="empty-spark">✧</span><h3>{title}</h3><p>{children}</p></div>; }
export function TextLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) { return <button className="text-link" onClick={onClick}>{children}<ArrowUpRight size={14} /></button>; }
export function ModalShell({ title, subtitle, children, wide = false, onClose }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean; onClose?: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const reducedMotion = useOfficeStore(s => s.settings.reducedMotion);
  const close = onClose ?? (() => useOfficeStore.getState().setModal(null));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const root = document.getElementById('app-shell');
    if (root) root.inert = true;
    const focusable = () => [...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, select, [tabindex="0"]') ?? [])];
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {
        const nodes = focusable(), first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', key);
    return () => { if (root) root.inert = false; window.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return createPortal(<div className={`modal-backdrop ${reducedMotion ? 'reduced-motion' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={panel}>
      <header className="modal-header"><div><span className="eyebrow">A LITTLE OFFICE BUSINESS</span><h2 id="dialog-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={19} /></button></header>
      {children}
    </div>
  </div>, document.body);
}
export function Toasts({ now }: { now: number }) {
  const notifications = useOfficeStore(s => s.notifications);
  const dismiss = useOfficeStore(s => s.dismissToast);
  return <div className="toast-stack" aria-live="polite">{notifications.filter(n => now - n.time < 6500).slice(0, 3).map(n => <div className="toast" key={n.id}><span className="toast-icon"><Check size={18} /></span><div><strong>{n.title}</strong><p>{n.detail}</p></div><button aria-label="Dismiss notification" onClick={() => dismiss(n.id)}><X size={14} /></button></div>)}</div>;
}
