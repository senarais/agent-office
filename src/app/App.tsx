import { lazy, Suspense, useEffect, useState } from 'react';
import { Bell, ChevronRight, Menu, Pause, Play, Settings2, Sun, Volume2, VolumeX, X } from 'lucide-react';
import { useOfficeStore } from '../store/useOfficeStore';
import { Sidebar } from '../components/Sidebar';
import { OfficeView, TeamView } from '../features/OfficeView';
import { ReportsView, TaskBoard } from '../features/TaskBoard';
import { Dialogs } from '../features/Dialogs';
import { Toasts } from '../components/ui';
import { officeAudio } from '../lib/audio';

const Analytics = lazy(() => import('../features/Analytics'));
const TITLES = { office: 'The office', tasks: 'Task board', team: 'Our people', analytics: 'Insights', reports: 'The paper trail' };

export default function App() {
  const view = useOfficeStore(s => s.view), settings = useOfficeStore(s => s.settings), audio = useOfficeStore(s => s.audio);
  const paused = useOfficeStore(s => s.paused), modal = useOfficeStore(s => s.modal);
  const newestEvent = useOfficeStore(s => s.events[0]);
  const notifications = useOfficeStore(s => s.notifications);
  const [now, setNow] = useState(Date.now());
  const [navOpen, setNavOpen] = useState(false), [bellOpen, setBellOpen] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const s = useOfficeStore.getState();
      if (s.settings.autoplay && !document.hidden) s.tick(1000);
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { officeAudio.configure(settings); officeAudio.sync(audio.track, audio.playing); }, [settings, audio.track, audio.playing]);
  useEffect(() => { if (modal) officeAudio.play('open'); }, [modal]);
  useEffect(() => {
    if (newestEvent?.type === 'report.generated') officeAudio.play('printer');
    if (newestEvent?.type === 'task.completed') officeAudio.play('complete');
    if (newestEvent?.type === 'task.blocked') officeAudio.play('alert');
  }, [newestEvent?.id]);
  useEffect(() => {
    let lastHover = 0;
    const click = (e: MouseEvent) => { if ((e.target as HTMLElement).closest('button')) officeAudio.play('click'); };
    const hover = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('button') && Date.now() - lastHover > 200) { lastHover = Date.now(); officeAudio.play('hover'); }
    };
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const s = useOfficeStore.getState();
      if (e.key === 'Escape') { setBellOpen(false); setNavOpen(false); }
      if (s.modal || s.reportId) return;
      if (e.key.toLowerCase() === 'm') s.updateSettings({ muted: !s.settings.muted });
      if (e.key === '?') s.setModal('help');
      if (e.key === 'Tab' && !target.closest('button, a, [role="dialog"]') && ['office', 'tasks'].includes(s.view)) {
        e.preventDefault(); s.setView(s.view === 'office' ? 'tasks' : 'office'); target.blur();
      }
      if (e.key === '/' && s.view === 'tasks') { e.preventDefault(); document.querySelector<HTMLInputElement>('[aria-label="Search tasks"]')?.focus(); }
    };
    window.addEventListener('keydown', key); document.addEventListener('click', click); document.addEventListener('mouseover', hover);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('click', click); document.removeEventListener('mouseover', hover); };
  }, []);
  useEffect(() => { setNavOpen(false); setBellOpen(false); window.scrollTo({ top: 0 }); }, [view]);
  const date = new Date(now);
  const s = useOfficeStore.getState();
  return <div className={`${settings.reducedMotion ? 'reduced-motion' : ''} ${settings.focusMode ? 'focus-mode' : ''}`} style={{ '--ui-scale': settings.uiScale } as React.CSSProperties}>
    <div className={`app-shell ${navOpen ? 'nav-open' : ''}`} id="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Sidebar />
      {navOpen && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setNavOpen(false)} />}
      <div className="workspace"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setNavOpen(!navOpen)}><Menu size={20} /></button><span className="breadcrumb-workspace">Workspace</span><ChevronRight size={13} /><strong>{TITLES[view]}</strong><span className="local-badge">LOCAL DEMO</span></div><div className="header-right"><span className="header-weather"><Sun size={16} />Nice & cozy<span className="header-divider" />{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><div className="header-buttons"><button className="icon-button" aria-label={settings.muted ? 'Unmute all audio' : 'Mute all audio'} title="Mute · M" onClick={() => s.updateSettings({ muted: !settings.muted })}>{settings.muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button><button className="icon-button" aria-label={paused ? 'Resume office' : 'Pause office'} onClick={s.togglePause}>{paused ? <Play size={16} /> : <Pause size={16} />}</button><button className={`icon-button notification-button ${bellOpen ? 'active' : ''}`} aria-label="Office notifications" aria-expanded={bellOpen} onClick={() => setBellOpen(!bellOpen)}><Bell size={17} />{notifications.length > 0 && <i />}</button><button className="icon-button header-settings" aria-label="Office settings" onClick={() => s.setModal('settings')}><Settings2 size={17} /></button></div></div>
      {bellOpen && <div className="notification-popover popover"><div><strong>Little office updates</strong><button className="icon-button" aria-label="Close notifications" onClick={() => setBellOpen(false)}><X size={14} /></button></div>{notifications.length ? notifications.slice(0, 6).map(n => <article key={n.id}><i /><div><strong>{n.title}</strong><p>{n.detail}</p></div></article>) : <p className="notifications-empty">All quiet for now. We’ll let you know when a little win comes along.</p>}</div>}
      </header>
      <main id="main-content" className="main-content" tabIndex={-1}>
        {view === 'office' && <OfficeView />}
        {view === 'tasks' && <TaskBoard />}
        {view === 'team' && <TeamView />}
        {view === 'reports' && <ReportsView />}
        {view === 'analytics' && <Suspense fallback={<div className="page-loading">Finding the little patterns…</div>}><Analytics /></Suspense>}
      </main></div>
    </div>
    <Dialogs /><Toasts now={now} />
  </div>;
}
