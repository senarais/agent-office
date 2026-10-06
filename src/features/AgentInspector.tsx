import { useState } from 'react';
import { ArrowUpRight, Coffee, MapPin, MessageCircle, MoreHorizontal, Pause, Play, Plus, Smile, Sparkles, Users, X } from 'lucide-react';
import { useOfficeStore } from '../store/useOfficeStore';
import { Avatar } from '../components/Avatar';
import { Progress, StatusChip } from '../components/ui';
import { ROOMS } from '../data/office';

export function AgentInspector() {
  const s = useOfficeStore();
  const [tab, setTab] = useState<'overview' | 'activity'>('overview');
  const [more, setMore] = useState(false);
  const agent = s.agents.find(a => a.id === s.selectedAgentId) ?? s.agents[0];
  const task = s.tasks.find(t => t.agentId === agent.id && ['doing', 'blocked'].includes(t.status));
  const queue = s.tasks.filter(t => t.agentId === agent.id && t.status === 'todo');
  const logs = s.events.filter(e => e.agentId === agent.id).slice(0, 5);
  return <section className="inspector panel" aria-label="Selected agent inspector">
    <div className="inspector-label"><span><i className="tiny-square" />TEAM SPOTLIGHT</span><div className="relative"><button className="icon-button" aria-label="More agent actions" onClick={() => setMore(!more)}><MoreHorizontal size={18} /></button>{more && <div className="popover agent-menu"><button onClick={() => { s.setAgentPaused(agent.id, !agent.paused); setMore(false); }}>{agent.paused ? <Play size={14} /> : <Pause size={14} />}{agent.paused ? 'Resume agent' : 'Pause agent'}</button><button onClick={() => { s.startMeeting(['arga', agent.id].filter((id, i, ids) => ids.indexOf(id) === i)); setMore(false); }}><Users size={14} />Call to meeting</button><button onClick={() => { s.clearAgentTask(agent.id); setMore(false); }}><X size={14} />Clear current task</button></div>}</div></div>
    <div className="agent-portrait" style={{ '--agent-color': agent.color } as React.CSSProperties}><div className="portrait-pixels"><i /><i /><i /><i /></div><Avatar agent={agent} size={94} /><span className="portrait-spark">✦</span><span className="portrait-status"><i /> {agent.paused ? 'TAKING A PAUSE' : 'A GOOD HUMAN (ISH)'}</span></div>
    <div className="inspector-identity"><div><h2>{agent.name}<span className="online-dot" /></h2><p>{agent.role}</p></div><span className="agent-number">0{s.agents.indexOf(agent) + 1}</span></div>
    <div className="inspector-tabs" role="tablist" aria-label="Agent details"><button role="tab" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Overview</button><button role="tab" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Recent activity <span>{logs.length}</span></button></div>
    {tab === 'overview' ? <div className="inspector-content"><div className="agent-state-row"><span>Right now</span><StatusChip status={agent.paused ? 'waiting' : agent.state} /></div>
      <div className="agent-meta"><MapPin size={13} /><span>{ROOMS.find(r => r.id === agent.room)?.name}</span><span className="meta-dot">·</span><Smile size={13} /><span>{agent.mood}%</span></div>
      <div className="current-task"><span className="eyebrow">{task ? 'MAKING PROGRESS ON' : 'A LITTLE BREATHING ROOM'}</span><h3>{task?.title ?? 'Room for the next good idea'}</h3>{task ? <><div className="task-progress-label"><span>{task.status === 'blocked' ? 'Your input would help' : `About ${Math.ceil((100 - task.progress) / 0.45 / 60 / s.settings.simulationSpeed)} min to a little win`}</span><strong>{Math.round(task.progress)}%</strong></div><Progress value={task.progress} color={agent.color} />{task.status === 'blocked' && <button className="button button-small button-amber" onClick={() => s.setTaskStatus(task.id, 'doing')}><Play size={13} />Resume task</button>}</> : <p>{queue.length ? `${queue.length} idea${queue.length > 1 ? 's' : ''} waiting in the queue.` : 'A good moment for a coffee, or a new task.'}</p>}</div>
      <div className="agent-quote"><Sparkles size={13} /><span>“{agent.bubble}”</span></div>
      <div className="inspector-actions"><button className="button button-primary" onClick={() => s.openTask(agent.id)}><Plus size={15} />Assign task</button><button className="button button-secondary" onClick={() => s.setModal('chat')}><MessageCircle size={15} />Say hello</button></div>
    </div> : <div className="inspector-content inspector-log">{logs.map(e => <div key={e.id}><i /><p>{e.text}<small>{new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></p></div>)}{logs.length === 0 && <p className="muted">Quiet desk, big possibilities. Activity will show up here.</p>}</div>}
    <button className="inspector-footer" onClick={() => s.setView('team')}><span><Coffee size={13} /> A small team with big heart.</span><ArrowUpRight size={14} /></button>
  </section>;
}
