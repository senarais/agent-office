import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Coffee, FileText, MessageCircle, Pause, Play, Plus, Send, Sparkles, Users } from 'lucide-react';
import { useOfficeStore } from '../store/useOfficeStore';
import { ModalShell, StatusChip } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { MusicPlayer } from '../components/MusicPlayer';
import { SettingsDialog } from './SettingsDialog';
import { officeAudio } from '../lib/audio';
import type { TaskType } from '../types';

function NewTaskDialog() {
  const s = useOfficeStore();
  const [title, setTitle] = useState(''), [description, setDescription] = useState('');
  const [agentId, setAgent] = useState(s.taskDraftAgent), [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [type, setType] = useState<TaskType>(s.agents.find(a => a.id === s.taskDraftAgent)?.specialty ?? 'Development');
  return <ModalShell title="Every good thing starts somewhere." subtitle="Give your team a little direction. They’ll take it from here."><form onSubmit={e => { e.preventDefault(); if (title.trim().length < 3) return; s.createTask({ title, description, agentId, priority, type }); officeAudio.play('assign'); }}><div className="form-body"><label className="field">What shall we work on? <span>REQUIRED</span><input autoFocus required minLength={3} maxLength={100} placeholder="A little idea with a lot of potential…" value={title} onChange={e => setTitle(e.target.value)} /></label><label className="field">A little more context<textarea rows={3} maxLength={2000} placeholder="What would a good outcome look like?" value={description} onChange={e => setDescription(e.target.value)} /></label><div className="form-grid"><label className="field">Kind of good work<select value={type} onChange={e => setType(e.target.value as TaskType)}>{['Development', 'Research', 'Design', 'Quality', 'Operations', 'Planning'].map(t => <option key={t}>{t}</option>)}</select></label><label className="field">Whose desk?<select value={agentId} onChange={e => { setAgent(e.target.value); const a = s.agents.find(a => a.id === e.target.value); if (a) setType(a.specialty); }}><option value="auto">Let Arga delegate ✦</option>{s.agents.map(a => <option value={a.id} key={a.id}>{a.name} · {a.role}</option>)}</select></label></div><label className="field">How soon is soon?<div className="priority-options">{(['Low', 'Medium', 'High'] as const).map(p => <button key={p} type="button" aria-pressed={priority === p} className={priority === p ? 'selected' : ''} onClick={() => setPriority(p)}><i className={`priority-dot priority-${p.toLowerCase()}`} />{p}<small>{p === 'Low' ? 'Room to breathe' : p === 'Medium' ? 'Keep it moving' : 'A little urgent'}</small>{priority === p && <Check size={13} />}</button>)}</div></label><div className="form-note"><Sparkles size={15} /><p>{agentId === 'auto' ? 'Arga will match this task to the right teammate. That’s what good managers do.' : 'Your teammate will head to their desk, make progress, and bring you a report.'}</p></div></div><footer className="modal-footer"><button type="button" className="button button-secondary" onClick={() => s.setModal(null)}>Maybe later</button><button className="button button-primary" type="submit" disabled={title.trim().length < 3}><Plus size={15} />Set a good thing in motion</button></footer></form></ModalShell>;
}

function ChatDialog() {
  const s = useOfficeStore();
  const agent = s.agents.find(a => a.id === s.selectedAgentId)!;
  const [text, setText] = useState('');
  const history = s.chats.filter(m => m.agentId === agent.id);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: s.settings.reducedMotion ? 'instant' : 'smooth', block: 'nearest' }); }, [history.length, s.settings.reducedMotion]);
  const send = (message: string) => { if (message.trim()) { s.sendChat(agent.id, message); setText(''); officeAudio.play('message'); } };
  return <ModalShell title={`A little chat with ${agent.name}`} subtitle={`${agent.role} · Local, simulated conversation`}><div className="chat-agent"><Avatar agent={agent} size={46} /><div><strong>{agent.name}</strong><span>{agent.personality}</span></div><StatusChip status={agent.state} /></div><div className="chat-messages" aria-live="polite">{!history.length && <div className="chat-welcome"><span>✦</span><p>Good conversations start<br />with a little hello.</p><small>{agent.name} is here. What’s on your mind?</small></div>}{history.map(m => <div key={m.id} className={`chat-message ${m.from === 'user' ? 'from-user' : 'from-agent'}`}>{m.from === 'agent' && <Avatar agent={agent} size={27} />}<div><span>{m.text}</span><small>{m.from === 'user' ? 'You' : agent.name} · {new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div></div>)}<div ref={end} /></div><div className="chat-quick"><button onClick={() => send('How’s your progress?')}><FileText size={12} />A quick update?</button><button onClick={() => send('Coffee break?')}><Coffee size={12} />Coffee?</button><button onClick={() => send('Great work, thank you!')}><Sparkles size={12} />A little appreciation</button></div><form className="chat-input" onSubmit={e => { e.preventDefault(); send(text); }}><input value={text} onChange={e => setText(e.target.value)} maxLength={1000} placeholder={`Say something to ${agent.name}…`} aria-label="Your message" /><button type="submit" className="button button-primary" disabled={!text.trim()} aria-label="Send message"><Send size={17} /></button></form><p className="chat-disclaimer">A bit of local make-believe. For actionable work, <button onClick={() => s.openTask(agent.id)}>assign a task.</button></p></ModalShell>;
}

function InteractionDialog() {
  const s = useOfficeStore();
  const a = s.agents.find(a => a.id === s.selectedAgentId)!;
  return <ModalShell title={`Hey, it’s ${a.name}.`} subtitle={a.personality}><div className="interaction-hero"><Avatar agent={a} size={80} /><div><StatusChip status={a.paused ? 'waiting' : a.state} /><p>“{a.bubble}”</p></div></div><div className="interaction-options">{[
    { icon: MessageCircle, title: 'Have a little chat', detail: 'Say hello, ask for an update, share a thought.', action: () => s.setModal('chat') },
    { icon: Plus, title: 'A good task for you', detail: 'Give this teammate something to work on.', action: () => s.openTask(a.id) },
    { icon: FileText, title: 'What’s on your desk?', detail: 'Check current work, queue, and progress.', action: () => { s.setView('tasks'); } },
    { icon: Users, title: 'Let’s get together', detail: 'Bring this teammate and Arga to a quick huddle.', action: () => { officeAudio.play('meeting'); s.startMeeting([...new Set(['arga', a.id])]); } },
    { icon: a.paused ? Play : Pause, title: a.paused ? 'Ready when you are' : 'Take a little pause', detail: a.paused ? 'Let’s get back to good work.' : 'Pause this agent’s work and movement.', action: () => { s.setAgentPaused(a.id, !a.paused); s.setModal(null); } },
  ].map(({ icon: Icon, title, detail, action }) => <button key={title} onClick={action}><span><Icon size={19} /></span><div><strong>{title}</strong><p>{detail}</p></div><ArrowRight size={16} /></button>)}</div></ModalShell>;
}

function MeetingDialog() {
  const s = useOfficeStore();
  const meeting = s.meetings.find(m => m.active), recent = s.meetings.filter(m => !m.active).slice(0, 3);
  return <ModalShell title={meeting ? 'Good minds, coming together.' : 'A little time, together.'} subtitle="A quick team huddle. A shared direction. Back to making things."><div className="meeting-body"><div className="meeting-avatars">{s.agents.filter(a => !meeting || meeting.agentIds.includes(a.id)).map(a => <div key={a.id}><Avatar agent={a} size={52} /><span>{a.name}</span></div>)}</div><div className="meeting-status"><span className={meeting ? 'live-dot' : 'gold-dot'} /><h3>{meeting ? 'The meeting room is open' : 'Bring everyone to the table'}</h3><p>{meeting ? `Team members will walk to the meeting room. About ${Math.ceil(Math.max(0, meeting.endsAt - s.simTime) / 1000 / s.settings.simulationSpeed)} seconds left${s.paused ? ' · Simulation paused' : ''}.` : 'The team will save their place, gather in the meeting room, and return to work after a 90-second simulated check-in.'}</p></div>{recent.length > 0 && <div className="meeting-notes"><span className="eyebrow">FROM OUR LAST LITTLE HUDDLE</span><p>{recent[0].notes}</p><small>{recent[0].agentIds.length} teammates · Notes saved locally</small></div>}</div><footer className="modal-footer"><button className="button button-secondary" onClick={() => s.setModal(null)}>Back to the office</button><button className="button button-primary" onClick={() => { officeAudio.play('meeting'); if (meeting) s.endMeeting(); else s.startMeeting(); }}><Users size={16} />{meeting ? 'Wrap up & save notes' : 'Ring the meeting bell'}</button></footer></ModalShell>;
}

function HelpDialog() {
  return <ModalShell title="Make yourself at home." subtitle="You’re the director. This little world is yours to wander."><div className="help-body"><div className="help-welcome"><Avatar director size={74} /><p>Find the little crown in the office. That’s you. Walk up to people and objects, or click them to say hello.</p></div><div className="controls-grid">{[['W A S D / ↑ ← ↓ →', 'Wander around'], ['SHIFT', 'A little faster'], ['E / SPACE', 'Talk or interact nearby'], ['ESC', 'Close a conversation'], ['M', 'Quiet the office'], ['TAB', 'Office ↔ task board'], ['?', 'A little guidance']].map(([key, label]) => <div key={key}><kbd>{key}</kbd><span>{label}</span></div>)}</div><div className="help-note"><Coffee size={21} /><p><strong>Try the coffee corner.</strong> A little caffeine gives you a 60-second speed boost. The jukebox, whiteboard, printer, and meeting table have something for you, too.</p></div><div className="help-note"><Sparkles size={21} /><p><strong>Local-first, a little make-believe.</strong> Agents, chats, and reports are simulated in your browser. Tasks and settings save here automatically. No account, no API, no cloud.</p></div><p className="muted small">Tab switches views when the office canvas or page background is focused. Inside controls and dialogs, it navigates normally.</p></div></ModalShell>;
}

export function Dialogs() {
  const modal = useOfficeStore(s => s.modal);
  if (modal === 'task') return <NewTaskDialog />;
  if (modal === 'chat') return <ChatDialog />;
  if (modal === 'interaction') return <InteractionDialog />;
  if (modal === 'settings') return <SettingsDialog />;
  if (modal === 'meeting') return <MeetingDialog />;
  if (modal === 'jukebox') return <ModalShell title="A soundtrack for your day." subtitle="Original little melodies for a world of good work."><div className="jukebox-body"><MusicPlayer expanded /></div></ModalShell>;
  if (modal === 'help') return <HelpDialog />;
  return null;
}
