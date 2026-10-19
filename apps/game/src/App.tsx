import { useEffect, useState } from 'react';
import { api, connect, useGame } from './state';
import type { Screen } from './state';
import { GameCanvas } from './game/GameCanvas';
import { audio } from './audio';
import { PixelWindow, PixelButton, Empty } from './ui/kit';
import { HR, Hire, EmployeeDialogue } from './ui/Employees';
import { AssignTask, Chat, Network, ProviderForm, Tasks } from './ui/Agents';
import { Analytics, Board, Company, Computer, Meetings, Reports, ReportView, OfficeLobby } from './ui/Company';
import { AudioOptions, Character, Coffee, Inventory, Options, Pause } from './ui/Options';
import { Schedules, ScheduleEditor } from './ui/Schedules';
import { Healing, Incidents, TortureRoom } from './ui/Health';
import { SocialMedia } from './ui/Social';
const titles: Record<Screen, string> = { pause: 'PAUSED / TAKE YOUR TIME', hr: 'HR TERMINAL / PEOPLE & CULTURE', employee: 'A CONVERSATION', hire: 'HR / EMPLOYEE FILE', chat: 'EMPLOYEE CONVERSATION', assign: 'NEW ASSIGNMENT', tasks: 'WORK QUEUE', network: 'IT TERMINAL / AGENT NETWORK', provider: 'NEW CONNECTION', computer: 'ABISENA OS', reports: 'REPORT TRAY', report: 'INTERNAL REPORT', meetings: 'MEETING ROOM / PROJECTOR', board: 'COMPANY WHITEBOARD', company: 'PT / COMPANY RECORDS', lobby: 'PT LOBBY / BUSINESSES', analytics: 'ABISENA OS / ANALYTICS', finance: 'ABISENA OS / FINANCE', audio: 'LOUNGE RADIO / AUDIO', graphics: 'OPTIONS / GRAPHICS', gameplay: 'OPTIONS / GAMEPLAY', character: 'DIRECTOR’S WARDROBE', inventory: 'INVENTORY', controls: 'CONTROLS', coffee: 'PANTRY / COFFEE MACHINE', plant: 'A VERY GOOD FERN', schedules: 'ABISENA OS / RECURRING TASKS', 'schedule-edit': 'AUTOPILOT / SCHEDULE EDITOR', heal: 'EMPLOYEE CARE / FULL HP', torture: 'TORTURE ROOM / MACHINE CONTROLS', incidents: 'HR / INCIDENT ARCHIVE', social: 'SOCIAL MEDIA STUDIO / CAMPAIGNS' };

function WindowContent({ screen, id }: { screen: Screen; id?: string }) {
  const world = useGame(s => s.world!); const employee = world.employees.find(e => e.id === id);
  switch (screen) {
    case 'pause': return <Pause />;
    case 'hr': return <HR />;
    case 'hire': return <Hire employeeId={id} />;
    case 'employee': return employee ? <EmployeeDialogue employee={employee} /> : <Empty>Employee not found.</Empty>;
    case 'chat': return employee ? <Chat employee={employee} /> : <Empty>Employee not found.</Empty>;
    case 'assign': return <AssignTask employeeId={id} />;
    case 'tasks': return <Tasks employeeId={id} />;
    case 'schedules': return <Schedules employeeId={id} />;
    case 'schedule-edit': return <ScheduleEditor editId={id} />;
    case 'social': return <SocialMedia reportId={id?.startsWith('report:') ? id.slice(7) : undefined} />;
    case 'heal': return <Healing employeeId={id} />;
    case 'torture': return <TortureRoom employeeId={id && world.employees.some(e => e.id === id) ? id : undefined} />;
    case 'incidents': return <Incidents />;
    case 'network': return <Network />;
    case 'provider': return <ProviderForm providerId={id} />;
    case 'computer': return <Computer />;
    case 'reports': return <Reports employeeId={id && world.employees.some(e => e.id === id) ? id : undefined} printer={id === 'printer'} />;
    case 'report': return <ReportView reportId={id!} />;
    case 'meetings': return <Meetings employeeId={id && world.employees.some(e => e.id === id) ? id : undefined} />;
    case 'board': return <Board />;
    case 'company': return <Company />;
    case 'lobby': return <OfficeLobby />;
    case 'analytics': return <Analytics />;
    case 'finance': return <Analytics finance />;
    case 'audio': return <AudioOptions />;
    case 'character': return <Character />;
    case 'inventory': return <Inventory />;
    case 'graphics': case 'gameplay': case 'controls': return <Options mode={screen} />;
    case 'coffee': return <Coffee />;
    case 'plant': return <Coffee plant />;
  }
}
function Title() {
  const [ready, setReady] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setReady(true), 700); return () => clearTimeout(timer); }, []);
  return <div className="title-screen"><div className="title-stars" /><div className="title-content"><div className="title-kicker">A LITTLE OFFICE. BIG IDEAS.</div><div className="title-logo">PT<span>EST. WHENEVER YOU’RE READY</span></div><h1>ABISENA<br />RAIS JAYA</h1><p className="title-motto">Building companies,<br className="mobile-only" /> one agent at a time.</p><div className="building-art" aria-hidden="true"><div className="building-sign">PT / ABISENA RAIS JAYA</div><div className="building-windows">{Array.from({ length: 10 }, (_, i) => <i key={i} />)}</div><div className="building-door"><i /><i /></div><div className="building-plant left" /><div className="building-plant right" /></div><PixelButton className="enter-office" disabled={!ready} onClick={() => { audio.unlock(); audio.play('boot'); useGame.setState({ entered: true }); }}>{ready ? '▶ ENTER OFFICE' : 'OPENING THE SHUTTERS…'}</PixelButton><p className="title-controls">WASD WALK · SHIFT RUN · E INTERACT</p><small>LOCAL-FIRST · REAL AGENTS · ORIGINAL PIXEL WORLD</small></div><div className="title-bottom"><span>© PT / WORK IN GOOD COMPANY</span><span>NO EMPLOYEES WERE PRE-HIRED.</span></div></div>;
}
function Tutorial() {
  const world = useGame(s => s.world!); const show = useGame(s => s.tutorial);
  const active = world.employees.filter(e => e.employmentStatus === 'active'); const steps = [active.length > 0, world.providers.some(p => p.status === 'connected'), active.some(e => e.providerId && e.model), world.tasks.length > 0, world.tasks.some(t => t.status === 'COMPLETED')];
  const index = steps.findIndex(done => !done); if (!show || index < 0) return null;
  const instructions = ['Walk to HR. Hire your first colleague.', 'Visit IT upstairs. Connect a real provider.', 'HR → Edit employee → Agent connection.', 'Approach your colleague. E → Assign task.', 'Let them work. Your report comes to you.'];
  return <aside className="quest-note"><div><span>YOUR FIRST DAY</span><button onClick={() => { useGame.setState({ tutorial: false }); localStorage.setItem('pt-tutorial-skipped', 'true'); }} aria-label="Skip tutorial">×</button></div><p><b>{index + 1}/5</b> {instructions[index]}</p><small>{index === 0 ? 'PEOPLE & CULTURE · LOWER LEFT ROOM' : index === 1 ? 'IT / AGENT NETWORK · UPPER RIGHT ROOM' : 'ONE GOOD STEP AT A TIME.'}</small></aside>;
}
function Hud() {
  const room = useGame(s => s.room); const connected = useGame(s => s.connected); const settings = useGame(s => s.world!.settings); const notifications = useGame(s => s.notifications); const [time, setTime] = useState(new Date());
  const world = useGame(s => s.world!); const office = world.offices.find(o => o.id === world.activeOfficeId);
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 10000); return () => clearInterval(t); }, []);
  return <div className="game-hud"><div className="hud-brand"><span>PT</span><div>{office?.name || 'ABISENA RAIS JAYA'}<small>{office ? office.industry.toUpperCase() : 'SMALL TEAM. GOOD THINGS.'}</small></div></div><div className="hud-location"><span className="day-icon">{settings.time === 'night' ? '☾' : '☼'}</span><div>{room}<small>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {connected ? 'LOCAL SAVE' : 'SERVER DISCONNECTED'}</small></div></div><div className="notifications" aria-live="polite">{notifications.map(n => <div className="pixel-toast" key={n.id}><span>!</span><p>{n.text}</p></div>)}</div><Tutorial /><div className="hud-controls"><span><kbd>WASD</kbd> MOVE</span><span><kbd>SHIFT</kbd> RUN</span><span><kbd>{settings.keys.interact.toUpperCase()}</kbd> INTERACT</span><span><kbd>SPACE</kbd> ACTION</span><button onClick={() => useGame.getState().open('pause')}><kbd>ESC</kbd> MENU</button><button onClick={() => void api('/settings', { muted: !settings.muted }, 'PATCH').catch(e => useGame.getState().toast(e.message))}><kbd>M</kbd> {settings.muted ? 'UNMUTE' : 'MUTE'}</button></div><div className="touch-controls">{['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'e'].map(k => <button key={k} aria-label={k} onPointerDown={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }))} onPointerUp={() => window.dispatchEvent(new KeyboardEvent('keyup', { key: k }))} onPointerLeave={() => window.dispatchEvent(new KeyboardEvent('keyup', { key: k }))}>{k.replace('Arrow', '')}</button>)}</div></div>;
}
export default function App() {
  const world = useGame(s => s.world); const entered = useGame(s => s.entered); const windowState = useGame(s => s.window); const error = useGame(s => s.error); const [bootError, setBootError] = useState('');
  const boot = () => { setBootError(''); void connect().catch(e => setBootError(e.message)); };
  useEffect(() => { boot(); if (localStorage.getItem('pt-tutorial-skipped')) useGame.setState({ tutorial: false }); }, []);
  useEffect(() => { if (world) audio.configure(world.settings); }, [world?.settings]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => { const state = useGame.getState(); if (!state.entered) return; if (e.key === 'Escape') { e.preventDefault(); if (state.window) state.close(); else state.open('pause'); audio.play('cancel'); } if (e.key.toLowerCase() === 'm' && !(e.target as HTMLElement).closest('input,textarea,select')) { e.preventDefault(); void api('/settings', { muted: !state.world!.settings.muted }, 'PATCH').catch(e => state.toast(e.message)); } };
    const click = (e: MouseEvent) => { if ((e.target as HTMLElement).closest('button')) audio.play('select'); };
    window.addEventListener('keydown', keydown); window.addEventListener('click', click); return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('click', click); };
  }, []);
  const s = world?.settings;
  if (!world) return <div className="boot-screen"><div className="pt-mark">PT</div><h1>ABISENA RAIS JAYA</h1><p>{bootError || 'UNLOCKING THE OFFICE…'}</p>{bootError && <PixelButton onClick={boot}>Retry local connection</PixelButton>}</div>;
  return <main className={`game-root ${s?.crt ? 'crt' : ''} ${s?.scanlines ? 'scanlines' : ''} ${s?.reducedMotion ? 'reduced-motion' : ''} ${s?.highContrast ? 'high-contrast' : ''}`} style={{ '--ui-scale': s?.windowScale } as React.CSSProperties}>
    <GameCanvas />{!entered ? <Title /> : <><Hud />{windowState && <PixelWindow key={`${windowState.screen}:${windowState.id || ''}`} title={titles[windowState.screen]} wide={['hr', 'hire', 'computer', 'network', 'tasks', 'board', 'meetings', 'analytics', 'social'].includes(windowState.screen)} dialogue={windowState.screen === 'employee'}>{error && <div className="error-banner" role="alert"><b>!</b><p>{error}</p><button onClick={() => useGame.setState({ error: '' })} aria-label="Dismiss error">×</button></div>}<WindowContent screen={windowState.screen} id={windowState.id} /></PixelWindow>}</>}
  </main>;
}
