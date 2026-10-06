import { create } from 'zustand';
import type { WorldState, ServerEvent, OfficeEvent } from '../../../packages/shared/src/types';

export type Screen = 'pause' | 'hr' | 'employee' | 'hire' | 'chat' | 'assign' | 'tasks' | 'network' | 'provider' | 'computer' | 'reports' | 'report' | 'meetings' | 'board' | 'company' | 'analytics' | 'finance' | 'audio' | 'graphics' | 'gameplay' | 'character' | 'inventory' | 'controls' | 'coffee' | 'plant';
export interface WindowState { screen: Screen; id?: string }
interface ClientState {
  world: WorldState | null; token: string; connected: boolean; demoEnabled: boolean; entered: boolean;
  window: WindowState | null; prompt: string; room: string; tutorial: boolean;
  notifications: { id: string; text: string }[]; lastEvent?: OfficeEvent; error: string;
  open: (screen: Screen, id?: string) => void; close: () => void; toast: (text: string) => void;
}
export const useGame = create<ClientState>((set, get) => ({ world: null, token: '', connected: false, demoEnabled: false, entered: false, window: null, prompt: '', room: 'RECEPTION', tutorial: true, notifications: [], error: '',
  open: (screen, id) => { const previous = get().window; if (previous?.id && ['employee', 'chat', 'assign'].includes(previous.screen) && (id !== previous.id || !['employee', 'chat', 'assign'].includes(screen))) void api(`/employees/${previous.id}/interact`, { hold: false }).catch(() => {}); set({ window: { screen, id }, error: '' }); },
  close: () => { const w = get().window; if (w?.id && ['employee', 'chat', 'assign'].includes(w.screen)) void api(`/employees/${w.id}/interact`, { hold: false }).catch(() => {}); set({ window: null, error: '' }); },
  toast: text => { const id = crypto.randomUUID(); set(s => ({ notifications: [...s.notifications.slice(-2), { id, text }] })); setTimeout(() => set(s => ({ notifications: s.notifications.filter(n => n.id !== id) })), 5500); },
}));
let stream: EventSource | undefined;
export async function connect() {
  const response = await fetch('/api/bootstrap'); if (!response.ok) throw new Error('Local server unavailable. Run npm run dev.');
  const data = await response.json(); useGame.setState({ world: data.state, token: data.token, demoEnabled: data.demoEnabled, connected: true });
  stream?.close(); stream = new EventSource('/api/events');
  stream.onmessage = event => { const message = JSON.parse(event.data) as ServerEvent; if (message.type === 'snapshot') useGame.setState({ world: message.state, connected: true }); else if (message.type === 'world.tick') { useGame.setState(s => ({ connected: true, world: s.world ? { ...s.world, savedAt: message.savedAt, employees: s.world.employees.map(e => ({ ...e, ...message.employees.find(p => p.id === e.id) })) } : null })); } else { useGame.setState({ lastEvent: message.event }); if (!['world.changed', 'settings.saved', 'task.progress', 'chat.message', 'chat.completed'].includes(message.event.type)) useGame.getState().toast(message.event.text); } };
  stream.onerror = () => useGame.setState({ connected: false });
}
export async function api<T = unknown>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Office-Token': useGame.getState().token }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || `Server error ${response.status}`); return data;
}
export async function act<T>(operation: () => Promise<T>): Promise<T | undefined> {
  useGame.setState({ error: '' }); try { return await operation(); } catch (e) { useGame.setState({ error: (e as Error).message }); return undefined; }
}
