import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { initialAgents, initialTasks, DEFAULT_SETTINGS, roomAt, MEETING_SPOTS, ROOMS } from '../data/office';
import { advanceSimulation, makeEvent, uid } from '../lib/simulation';
import { findPath } from '../game/pathfinding';
import type { Agent, Task, OfficeEvent, Settings, ChatMessage, Meeting, View, Modal, Notification, Point, ActivitySample } from '../types';

interface OfficeStore {
  agents: Agent[]; tasks: Task[]; events: OfficeEvent[]; settings: Settings; chats: ChatMessage[];
  meetings: Meeting[]; notifications: Notification[]; activity: ActivitySample[]; simTime: number;
  selectedAgentId: string; view: View; modal: Modal; paused: boolean; taskDraftAgent: string;
  player: Point; caffeinatedUntil: number; interaction: string | null; reportId: string | null;
  audio: { playing: boolean; track: number; shuffle: boolean };
  selectAgent: (id: string) => void; setView: (view: View) => void; setModal: (modal: Modal) => void;
  openTask: (agentId?: string) => void; createTask: (task: Pick<Task, 'title' | 'description' | 'priority' | 'agentId' | 'type'>) => void;
  setTaskStatus: (id: string, status: Task['status']) => void;
  setAgentPaused: (id: string, paused: boolean) => void; clearAgentTask: (id: string) => void;
  startMeeting: (ids?: string[]) => void; endMeeting: () => void; sendChat: (id: string, text: string) => void;
  updateSettings: (settings: Partial<Settings>) => void; togglePause: () => void;
  setAudio: (audio: Partial<OfficeStore['audio']>) => void; nextTrack: (direction?: number) => void;
  tick: (dt: number) => void; updatePositions: (positions: Record<string, Point>) => void;
  setPlayer: (player: Point) => void; setInteraction: (id: string | null) => void; interact: (id: string) => void;
  notify: (title: string, detail?: string) => void; reset: (all?: boolean) => void; dismissToast: (id: string) => void;
  setReport: (id: string | null) => void;
}

function seed() {
  return {
    agents: initialAgents(), tasks: initialTasks(), chats: [] as ChatMessage[], meetings: [] as Meeting[],
    events: [makeEvent('task.blocked', 'Damar needs your input on the welcome tour', 'damar'), makeEvent('task.started', 'Tita is exploring a fresh visual direction', 'tita'), makeEvent('task.started', 'Bima is building the interactive prototype', 'bima'), makeEvent('agent.moved', 'Nisa settled into the research library', 'nisa'), makeEvent('report.generated', 'The Monday briefing is ready for you', 'arga')],
    notifications: [] as Notification[], activity: [] as ActivitySample[], simTime: 0,
    player: { x: 648, y: 328 }, caffeinatedUntil: 0,
  };
}

export const useOfficeStore = create<OfficeStore>()(persist((set, get) => ({
  ...seed(), settings: DEFAULT_SETTINGS, selectedAgentId: 'bima', view: 'office', modal: null,
  paused: false, taskDraftAgent: 'auto', interaction: null, reportId: null,
  audio: { playing: false, track: 0, shuffle: false },
  selectAgent: id => set({ selectedAgentId: id }),
  setView: view => set({ view, modal: null }),
  setModal: modal => set({ modal }),
  openTask: (agentId = 'auto') => set({ modal: 'task', taskDraftAgent: agentId }),
  createTask: input => {
    const state = get();
    const agent = state.agents.find(a => input.agentId === 'auto' ? a.specialty === input.type : a.id === input.agentId) ?? state.agents[0];
    const task: Task = { ...input, title: input.title.trim(), id: uid('T'), agentId: agent.id, createdAt: Date.now(), progress: 0, status: 'todo' };
    if (!task.title) return;
    set({ tasks: [task, ...state.tasks], modal: null, events: [makeEvent('task.assigned', `${input.agentId === 'auto' ? 'Arga delegated' : 'You assigned'} “${task.title}” to ${agent.name}`, agent.id), makeEvent('task.created', `New task: ${task.title}`, agent.id), ...state.events].slice(0, 100) });
    get().notify('A little idea, set in motion', `${agent.name} has your task in their queue.`);
  },
  setTaskStatus: (id, status) => {
    const state = get(), task = state.tasks.find(t => t.id === id);
    if (!task) return;
    const agent = state.agents.find(a => a.id === task.agentId)!;
    const type = status === 'done' ? 'task.completed' : status === 'blocked' ? 'task.blocked' : 'task.assigned';
    set({
      tasks: state.tasks.map(t => t.id === id ? { ...t, status, progress: status === 'done' || status === 'review' ? 100 : status === 'todo' ? 0 : t.progress, completedAt: status === 'done' ? Date.now() : undefined } : t),
      agents: state.agents.map(a => a.id === agent.id ? { ...a, state: status === 'blocked' ? 'blocked' : 'idle', stateUntil: 0, destination: a.home } : a),
      events: [makeEvent(type, `${agent.name}’s “${task.title}” → ${status}`, agent.id), ...state.events].slice(0, 100),
    });
    if (status === 'done') get().notify('Good things, done.', `“${task.title}” approved. One step forward.`);
  },
  setAgentPaused: (id, paused) => set(s => ({ agents: s.agents.map(a => a.id === id ? { ...a, paused, state: paused ? 'waiting' : 'idle', stateUntil: 0 } : a), events: [makeEvent('agent.state.changed', `${s.agents.find(a => a.id === id)?.name} ${paused ? 'paused' : 'resumed'}`, id), ...s.events].slice(0, 100) })),
  clearAgentTask: id => {
    const state = get(), task = state.tasks.find(t => t.agentId === id && ['doing', 'blocked'].includes(t.status));
    if (task) set({ tasks: state.tasks.filter(t => t.id !== task.id), agents: state.agents.map(a => a.id === id ? { ...a, state: 'idle', bubble: 'Ready for a fresh start.', stateUntil: 0 } : a) });
    get().notify('Desk cleared', 'Current task removed. Queued work stays in place.');
  },
  startMeeting: (ids = get().agents.map(a => a.id)) => {
    const s = get();
    if (s.meetings.some(m => m.active)) { set({ modal: 'meeting' }); return; }
    const meeting: Meeting = { id: uid('meeting'), startedAt: s.simTime, endsAt: s.simTime + 90000, agentIds: ids, active: true, notes: '' };
    set({ meetings: [meeting, ...s.meetings].slice(0, 20), modal: 'meeting', agents: s.agents.map(a => ids.includes(a.id) ? { ...a, paused: false, state: 'walking', destination: MEETING_SPOTS[ids.indexOf(a.id) % MEETING_SPOTS.length] } : a), events: [makeEvent('meeting.started', `${ids.length} teammates are heading to the meeting room`), ...s.events].slice(0, 100) });
    get().notify('A meeting of good minds', 'The team is heading to the meeting room.');
  },
  endMeeting: () => {
    const s = get();
    set({ meetings: s.meetings.map(m => m.active ? { ...m, endsAt: s.simTime } : m) });
    get().tick(0);
  },
  sendChat: (id, text) => {
    const s = get(), agent = s.agents.find(a => a.id === id);
    if (!agent || !text.trim()) return;
    const task = s.tasks.find(t => t.agentId === id && ['doing', 'blocked', 'todo'].includes(t.status));
    const greetings: Record<string, string> = { arga: 'Hey, boss. Let’s make the next step a good one.', nisa: 'Ooh, good question! I’ve been connecting a few dots.', bima: 'Hey! Coffee’s warm and the code is coming together.', tita: 'Hi! I’ve got a few ideas I think you’ll love.', damar: 'Hello! Looking at the little things so you don’t have to.', sari: 'Hey there! Everything’s moving along nicely.' };
    const lower = text.toLowerCase();
    const response = /status|progress|working|update/.test(lower) ? task ? `I’m on “${task.title}” — ${Math.round(task.progress)}% so far.${task.status === 'blocked' ? ' I need a decision on the brief. Use Resume task when you’re ready.' : ' I’ll bring a report when it’s ready.'}` : 'My desk is clear. Have something in mind? Assign me a task and I’ll get moving.'
      : /coffee|break/.test(lower) ? 'A tiny break makes room for a better idea. Meet you at the coffee corner!'
      : /thank|great|nice/.test(lower) ? 'That means a lot, boss. Small team, good things. Let’s keep going!'
      : `${greetings[id]} I’ve noted: “${text.slice(0, 100)}”. For something actionable, send it as a task and I’ll prepare a local demo report.`;
    if (/coffee|break/.test(lower)) set({ agents: s.agents.map(a => a.id === id ? { ...a, destination: { x: 200, y: 456 }, state: 'walking', stateUntil: s.simTime + 45000, bubble: 'Coffee? Coffee.' } : a) });
    set(current => ({ chats: [...current.chats, { id: uid('chat'), agentId: id, from: 'user' as const, text: text.trim(), time: Date.now() }, { id: uid('chat'), agentId: id, from: 'agent' as const, text: response, time: Date.now() + 1 }].slice(-200), events: [makeEvent('chat.received', `${agent.name} replied to you`, id), makeEvent('chat.sent', `You messaged ${agent.name}`, id), ...current.events].slice(0, 100) }));
  },
  updateSettings: settings => set(s => ({ settings: { ...s.settings, ...settings } })),
  togglePause: () => set(s => ({ paused: !s.paused })),
  setAudio: audio => set(s => ({ audio: { ...s.audio, ...audio } })),
  nextTrack: (direction = 1) => set(s => ({ audio: { ...s.audio, track: s.audio.shuffle ? (s.audio.track + 1 + Math.floor(Math.random() * 2)) % 3 : (s.audio.track + direction + 3) % 3 } })),
  tick: dt => {
    const s = get();
    if (s.paused && dt > 0) return;
    const elapsed = dt * s.settings.simulationSpeed, now = s.simTime + elapsed;
    // Dashboard views keep the office moving even while the renderer is unmounted.
    const agents = s.view === 'office' && s.settings.autoplay ? s.agents : s.agents.map(agent => {
      if (agent.paused) return agent;
      let remaining = elapsed / 1000 * 47;
      let position = { ...agent.position };
      for (const point of findPath(position, agent.destination)) {
        const distance = Math.hypot(point.x - position.x, point.y - position.y);
        if (distance > remaining) {
          position = { x: position.x + (point.x - position.x) / distance * remaining, y: position.y + (point.y - position.y) / distance * remaining };
          break;
        }
        position = point; remaining -= distance;
        if (remaining <= 0) break;
      }
      return { ...agent, position, room: roomAt(position) };
    });
    const result = advanceSimulation(agents, s.tasks, s.meetings, now, elapsed);
    const fresh = result.events;
    const activity = s.activity.length === 0 || now - s.activity[s.activity.length - 1].time >= 10000
      ? [...s.activity, { time: now, work: result.agents.filter(a => a.state === 'working').length, completed: result.tasks.filter(t => t.status === 'done').length }].slice(-60) : s.activity;
    set({ ...result, simTime: now, activity, events: [...fresh.reverse(), ...s.events].slice(0, 100) });
    for (const event of fresh.filter(e => e.type === 'report.generated')) get().notify('Fresh off the printer', event.text);
  },
  updatePositions: positions => set(s => {
    const moved: OfficeEvent[] = [];
    const agents = s.agents.map(a => {
      const position = positions[a.id];
      if (!position) return a;
      const room = roomAt(position);
      if (room !== a.room && room !== 'lobby') moved.push(makeEvent('agent.moved', `${a.name} entered ${ROOMS.find(r => r.id === room)?.name}`, a.id));
      return { ...a, position, room };
    });
    return { agents, events: [...moved, ...s.events].slice(0, 100) };
  }),
  setPlayer: player => set({ player }),
  setInteraction: interaction => set({ interaction }),
  interact: id => {
    const s = get();
    if (s.agents.some(a => a.id === id)) { set({ selectedAgentId: id, modal: 'interaction' }); return; }
    if (id === 'coffee') { set({ caffeinatedUntil: Date.now() + 60000 }); s.notify('A little cup of ambition', 'Caffeinated! +20% walking speed for 60 seconds.'); }
    else if (id === 'whiteboard') set({ view: 'tasks' });
    else if (id === 'printer') set({ view: 'reports' });
    else if (id === 'meeting-table') set({ modal: 'meeting' });
    else if (id === 'jukebox') set({ modal: 'jukebox' });
    else if (id === 'sign') s.notify('PT = People & Possibilities', 'Abisena Rais Jaya. A little office, full of big ideas. ✦');
    else {
      const agentId = id.split('-')[0];
      if (s.agents.some(a => a.id === agentId)) set({ selectedAgentId: agentId, modal: 'interaction' });
    }
  },
  notify: (title, detail = '') => set(s => ({ notifications: [{ id: uid('note'), title, detail, time: Date.now() }, ...s.notifications].slice(0, 30) })),
  dismissToast: id => set(s => ({ notifications: s.notifications.map(n => n.id === id ? { ...n, time: 0 } : n) })),
  reset: (all = false) => set(s => ({ ...seed(), settings: all ? DEFAULT_SETTINGS : s.settings, modal: null, reportId: null, paused: false, selectedAgentId: 'bima', view: 'office', audio: { playing: false, track: 0, shuffle: false } })),
  setReport: reportId => set({ reportId }),
}), {
  name: 'abisena-office-v1', version: 1, storage: createJSONStorage(() => localStorage),
  partialize: s => ({ agents: s.agents, tasks: s.tasks, events: s.events, settings: s.settings, chats: s.chats, meetings: s.meetings, activity: s.activity, simTime: s.simTime, player: s.player, audio: { ...s.audio, playing: false } }),
}));
