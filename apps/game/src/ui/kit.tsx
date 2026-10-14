import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode, ReactElement } from 'react';
import type { Appearance } from '../../../../packages/shared/src/types';
import { drawCharacter } from '../game/art';
import { useGame } from '../state';
import { audio } from '../audio';

export function PixelButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={`pixel-button ${className}`} {...props}>{children}</button>; }
export function PixelWindow({ title, subtitle, children, wide = false, dialogue = false }: PropsWithChildren<{ title: string; subtitle?: string; wide?: boolean; dialogue?: boolean }>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; const previous = document.activeElement as HTMLElement | null;
    el?.querySelector<HTMLElement>('input:not([type=checkbox]),textarea,[data-autofocus],button')?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (!el || (e.target as HTMLElement).closest('input, textarea, select')) return;
      const buttons = [...el.querySelectorAll<HTMLButtonElement>('[data-menu]:not(:disabled)')];
      if (buttons.length && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); const i = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); audio.play('move'); }
    };
    const trap = (e: KeyboardEvent) => { if (e.key !== 'Tab' || !el) return; const nodes = [...el.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(node => node.offsetParent !== null); const first = nodes[0], last = nodes.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } };
    window.addEventListener('keydown', key); window.addEventListener('keydown', trap); return () => { window.removeEventListener('keydown', key); window.removeEventListener('keydown', trap); previous?.focus({ preventScroll: true }); };
  }, [title]);
  return <div className={`window-scrim ${dialogue ? 'dialogue-scrim' : ''}`}><section ref={ref} className={`pixel-window ${wide ? 'wide' : ''} ${dialogue ? 'dialogue-window' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
    <header className="window-title"><span className="window-lights">▪ ▪ ▪</span><div><h1>{title}</h1>{subtitle && <span>{subtitle}</span>}</div><PixelButton className="close-button" onClick={() => { audio.play('cancel'); useGame.getState().close(); }} aria-label="Close window">×</PixelButton></header>
    <div className="window-body">{children}</div><footer className="window-footer"><span>PT ABISENA RAIS JAYA</span><span>ESC CLOSE · TAB / ↑ ↓ NAVIGATE</span></footer>
  </section></div>;
}
export function PixelTabs({ values, current, onChange }: { values: string[]; current: string; onChange: (value: string) => void }) { return <div className="pixel-tabs" role="tablist">{values.map(value => <button type="button" key={value} role="tab" aria-selected={value === current} onClick={() => onChange(value)}>{value}</button>)}</div>; }
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { const id = useId(); return <div className="field"><label htmlFor={id}>{label}</label>{Children.map(children, child => isValidElement(child) && ['input', 'textarea', 'select'].includes(child.type as string) ? cloneElement(child as ReactElement<{ id?: string; 'aria-describedby'?: string }>, { id, 'aria-describedby': hint ? `${id}-hint` : undefined }) : child)}{hint && <small id={`${id}-hint`}>{hint}</small>}</div>; }
export function PixelProgress({ value, label }: { value: number; label: string }) { return <div className="stat"><span>{label}</span><div role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}><i style={{ width: `${value}%` }} /></div><b>{value}</b></div>; }
export function Empty({ children }: PropsWithChildren) { return <div className="empty"><span className="empty-symbol">[ · · · ]</span><p>{children}</p></div>; }
export function Avatar({ appearance, boss = false, size = 3 }: { appearance: Appearance; boss?: boolean; size?: number }) { const ref = useRef<HTMLCanvasElement>(null); useEffect(() => { const c = ref.current!.getContext('2d')!; c.clearRect(0, 0, 32, 42); drawCharacter(c, appearance, 0, 0, boss); }, [appearance, boss]); return <canvas className="avatar" width={32} height={42} style={{ width: 32 * size, height: 42 * size }} ref={ref} aria-label="Pixel character portrait" />; }
export function PixelDialogue({ text }: { text: string }) {
  const speed = useGame(s => s.world!.settings.textSpeed); const reduced = useGame(s => s.world!.settings.reducedMotion); const [count, setCount] = useState(0);
  useEffect(() => { setCount(speed === 'instant' || reduced ? text.length : 0); if (speed === 'instant' || reduced) return; const timer = setInterval(() => setCount(n => { if (n < text.length) audio.play('text'); return Math.min(n + 2, text.length); }), { slow: 65, normal: 35, fast: 15 }[speed]); return () => clearInterval(timer); }, [text, speed, reduced]);
  useEffect(() => { const handler = (e: KeyboardEvent) => { if ((e.code === 'Space' || e.key === 'Enter') && !(e.target as HTMLElement).closest('input,textarea,button,select')) { e.preventDefault(); setCount(text.length); } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [text]);
  return <p className="dialogue-text" aria-label={text} onClick={() => setCount(text.length)}>{text.slice(0, count)}<span className="text-cursor">▾</span></p>;
}
export function useAction() { const [busy, setBusy] = useState(false); return { busy, run: async (fn: () => Promise<unknown>) => { setBusy(true); useGame.setState({ error: '' }); try { await fn(); } catch (error) { useGame.setState({ error: (error as Error).message }); audio.play('error'); } finally { setBusy(false); } } }; }
export function PixelIcon({ kind = 'computer' }: { kind?: string }) {
  const paths: Record<string, string> = { computer: 'M2 2h12v9H9v2h3v1H4v-1h3v-2H2z M4 4v5h8V4z', people: 'M3 1h4v4H3z M9 3h4v4H9z M1 7h8v7H1z M10 9h5v5h-5z', tasks: 'M3 1h10v14H3z M5 4h2v2H5z M9 4h2v1H9z M5 8h2v2H5z M9 8h2v1H9z M5 12h6v1H5z', report: 'M3 1h7v4h4v10H3z M11 1v3h3z M5 7h7v1H5z M5 10h7v1H5z M5 13h5v1H5z', network: 'M2 1h12v5H2z M2 8h12v6H2z M4 3h2v1H4z M4 10h2v2H4z M8 3h4v1H8z M8 11h4v1H8z', chart: 'M1 1h1v13h13v1H1z M4 9h2v4H4z M8 6h2v7H8z M12 3h2v10h-2z', music: 'M6 3h8v9h-3v-3h2V5H7v8H3v-3h3z', gear: 'M6 1h4v2h3v3h2v4h-2v3h-3v2H6v-2H3v-3H1V6h2V3h3z M6 6v4h4V6z', company: 'M6 1h4v2h4v12H2V3h4z M4 5h2v2H4z M8 5h2v2H8z M12 5h1v2h-1z M4 9h2v2H4z M8 9h2v2H8z M7 13h3v2H7z', meeting: 'M5 1h6v3H5z M1 6h3v5H1z M12 6h3v5h-3z M5 5h6v8H5z M6 14h4v1H6z', coin: 'M5 1h6v2h2v2h2v6h-2v2h-2v2H5v-2H3v-2H1V5h2V3h2z M7 4h2v8H7z' };
  return <svg className="pixel-icon" viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges"><path d={paths[kind] || paths.computer} fillRule="evenodd" /></svg>;
}
