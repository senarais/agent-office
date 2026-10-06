import { Armchair, LayoutGrid, Users, ChartNoAxesCombined, Files, Settings2, CircleHelp, Sprout, ArrowUpRight, CheckCheck } from 'lucide-react';
import { useOfficeStore } from '../store/useOfficeStore';
import { Avatar } from './Avatar';
import type { View } from '../types';

const NAV = [
  { id: 'office', label: 'The office', icon: Armchair }, { id: 'tasks', label: 'Task board', icon: LayoutGrid },
  { id: 'team', label: 'Our people', icon: Users }, { id: 'analytics', label: 'Insights', icon: ChartNoAxesCombined },
  { id: 'reports', label: 'The paper trail', icon: Files },
] as const;
export function Sidebar() {
  const view = useOfficeStore(s => s.view), setView = useOfficeStore(s => s.setView), modal = useOfficeStore(s => s.setModal);
  const tasks = useOfficeStore(s => s.tasks);
  return <aside className="sidebar">
    <button className="brand" onClick={() => setView('office')} aria-label="PT Abisena Rais Jaya home"><span className="brand-mark">PT<span className="brand-spark">✦</span></span><span className="brand-name">ABISENA<br />RAIS JAYA<span>A LITTLE OFFICE. BIG IDEAS.</span></span></button>
    <div className="workspace-switch"><span className="workspace-avatar"><Sprout size={17} /></span><div>Abisena headquarters<small>Our happy place</small></div><span className="workspace-check">⌄</span></div>
    <span className="nav-caption">YOUR WORKSPACE</span>
    <nav aria-label="Main navigation">{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => setView(id as View)} aria-current={view === id ? 'page' : undefined}><Icon size={18} strokeWidth={1.7} /><span>{label}</span>{id === 'tasks' && <span className="nav-count">{tasks.filter(t => !['done', 'review'].includes(t.status)).length}</span>}{id === 'reports' && tasks.some(t => t.status === 'review') && <span className="nav-ping" />}</button>)}</nav>
    <div className="sidebar-note"><div className="note-drawing"><span>✦</span><Sprout size={33} strokeWidth={1.2} /><span>+</span></div><p>Good things grow<br />with good people.</p><span>MAKE A LITTLE PROGRESS TODAY.</span><button onClick={() => { setView('team'); }} aria-label="Meet our people"><ArrowUpRight size={17} /></button></div>
    <div className="sidebar-bottom"><button className="nav-item" onClick={() => modal('settings')}><Settings2 size={18} strokeWidth={1.7} /><span>Make it yours</span></button><button className="nav-item" onClick={() => modal('help')}><CircleHelp size={18} strokeWidth={1.7} /><span>A little guidance</span><kbd>?</kbd></button><div className="local-status"><CheckCheck size={13} /><span>Local-first. Always yours.</span><i /></div>
      <div className="director-profile"><Avatar director size={37} /><div><strong>The Director</strong><small>A good day to lead.</small></div><span className="profile-online" /></div>
    </div>
  </aside>;
}
