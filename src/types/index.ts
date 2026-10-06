export type AgentState = 'idle' | 'walking' | 'working' | 'chatting' | 'thinking' | 'needs input' | 'waiting' | 'in meeting' | 'on break' | 'task complete' | 'blocked';
export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'review' | 'done';
export type TaskType = 'Development' | 'Research' | 'Design' | 'Quality' | 'Operations' | 'Planning';
export type RoomId = 'research' | 'developer' | 'meeting' | 'server' | 'pantry' | 'lounge' | 'design' | 'workspace' | 'manager' | 'lobby';
export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }
export interface Room extends Rect { id: RoomId; name: string; color: string }
export interface Agent {
  id: string; name: string; role: string; specialty: TaskType; personality: string;
  color: string; skin: string; hair: string; state: AgentState; mood: number;
  room: RoomId; home: Point; position: Point; destination: Point;
  paused: boolean; bubble: string; stateUntil: number;
}
export interface Task {
  id: string; title: string; description: string; priority: 'Low' | 'Medium' | 'High';
  agentId: string; type: TaskType; status: TaskStatus; progress: number;
  createdAt: number; completedAt?: number; output?: string;
}
export type EventType = 'agent.moved' | 'agent.state.changed' | 'task.created' | 'task.assigned' | 'task.started' | 'task.blocked' | 'task.completed' | 'meeting.started' | 'meeting.ended' | 'chat.sent' | 'chat.received' | 'ui.clicked' | 'audio.changed' | 'report.generated';
export interface OfficeEvent { id: string; type: EventType; text: string; time: number; agentId?: string }
export interface ChatMessage { id: string; agentId: string; from: 'user' | 'agent'; text: string; time: number }
export interface Settings {
  masterVolume: number; musicVolume: number; sfxVolume: number; ambience: boolean; muted: boolean;
  animationSpeed: number; simulationSpeed: number; speechBubbles: boolean; pathLines: boolean;
  dayMode: boolean; uiScale: number; reducedMotion: boolean; focusMode: boolean; autoplay: boolean;
}
export interface Meeting { id: string; startedAt: number; endsAt: number; agentIds: string[]; active: boolean; notes: string }
export type View = 'office' | 'tasks' | 'team' | 'analytics' | 'reports';
export type Modal = 'task' | 'settings' | 'chat' | 'interaction' | 'meeting' | 'jukebox' | 'help' | null;
export interface Notification { id: string; title: string; detail: string; time: number }
export interface ActivitySample { time: number; work: number; completed: number }
