export type Point = { x: number; y: number };
export type Rect = Point & { w: number; h: number };
export const departments = ['Development', 'Research', 'Creative', 'QA', 'Operations'] as const;
export type Department = typeof departments[number];
export type Appearance = {
  skin: string; hair: string; hairstyle: 'short' | 'long' | 'spiky' | 'bald';
  shirt: string; jacket: string; bottom: string; shoes: string;
  skirt: boolean; glasses: boolean; hat: boolean; accessory: boolean;
};
export const defaultAppearance: Appearance = { skin: '#d9a17c', hair: '#493a36', hairstyle: 'short', shirt: '#729a89', jacket: '#394e59', bottom: '#354552', shoes: '#e0d5b2', skirt: false, glasses: false, hat: false, accessory: true };
export type Employment = 'active' | 'fired' | 'deceased' | 'quit';
export type EmployeeState = 'idle' | 'walking' | 'working' | 'reading' | 'terminal' | 'waiting' | 'blocked' | 'report' | 'meeting' | 'coffee' | 'following' | 'leaving' | 'hurt' | 'dead';
export interface Employee {
  id: string; name: string; role: string; department: Department; personality: string; responsibilities: string; systemPrompt: string;
  providerId: string; model: string; tools: string[]; appearance: Appearance; employmentStatus: Employment;
  state: EmployeeState; position: Point; destination: Point; home: Point; bubble: string; bubbleUntil: number;
  morale: number; energy: number; relationship: number; stress: number; hiredAt: string; endedAt?: string;
  following: boolean; reportId?: string; hurtUntil?: number;
}
export type TaskStatus = 'QUEUED' | 'WALKING_TO_WORKSTATION' | 'STARTING' | 'WORKING' | 'WAITING_FOR_TOOL' | 'WAITING_FOR_USER' | 'BLOCKED' | 'REVIEWING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export const terminalTasks: TaskStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];
export interface Task {
  id: string; employeeId: string; title: string; instructions: string; priority: 'Low' | 'Normal' | 'High';
  expectedOutput: string; projectPath: string; deadline: string; tools: string[]; status: TaskStatus;
  providerId: string; model: string; result: string; error?: string; createdAt: string; startedAt?: string; completedAt?: string;
  usage?: Usage; sessionId?: string; clarification?: string;
}
export interface Usage { inputTokens?: number; outputTokens?: number; totalTokens?: number; cost?: number }
export interface Message { id: string; conversationId: string; role: 'user' | 'assistant'; text: string; createdAt: string; status: 'complete' | 'streaming' | 'error' | 'cancelled'; error?: string; usage?: Usage }
export interface Conversation { id: string; employeeId: string; createdAt: string; sessionId?: string }
export interface Report { id: string; taskId: string; employeeId: string; title: string; text: string; createdAt: string; approved: boolean; delivered: boolean }
export interface Meeting { id: string; topic: string; attendeeIds: string[]; status: 'gathering' | 'running' | 'completed' | 'failed' | 'cancelled'; messages: { employeeId: string; text: string }[]; summary: string; decisions: string[]; actions: { employeeId: string; title: string; taskId?: string }[]; error?: string; createdAt: string }
export type ProviderKind = 'openai' | 'opencode' | 'generic' | 'demo';
export interface ProviderConfig { id: string; name: string; kind: ProviderKind; baseUrl: string; enabled: boolean; models: string[]; status: 'untested' | 'connected' | 'error'; error?: string; hasSecret: boolean }
export interface Secret { apiKey?: string; headers?: Record<string, string> }
export type EventType = 'employee.hired' | 'employee.updated' | 'employee.fired' | 'employee.deceased' | 'employee.arrived' | 'task.created' | 'task.started' | 'task.progress' | 'task.completed' | 'task.failed' | 'task.cancelled' | 'chat.message' | 'chat.completed' | 'meeting.started' | 'meeting.message' | 'meeting.completed' | 'provider.connected' | 'provider.failed' | 'report.delivered' | 'combat.hit' | 'settings.saved' | 'world.changed';
export interface OfficeEvent { id: string; type: EventType; text: string; entityId?: string; createdAt: string }
export interface Settings {
  master: number; music: number; sfx: number; ambient: number; dialogue: number; muted: boolean;
  musicOn: boolean; sfxOn: boolean; ambientOn: boolean; track: number; shuffle: boolean; repeat: boolean;
  time: 'local' | 'day' | 'night'; playerSpeed: 'normal' | 'fast' | 'very fast'; npcSpeed: 'normal' | 'fast' | 'very fast';
  textSpeed: 'slow' | 'normal' | 'fast' | 'instant'; animationSpeed: 'normal' | 'fast';
  pixelScale: number; windowScale: number; cameraSmoothness: number; shake: boolean; crt: boolean; scanlines: boolean; glow: boolean; weather: boolean; reducedMotion: boolean; damageFlash: boolean; highContrast: boolean;
  violence: 'full' | 'slapstick' | 'disabled'; keys: { up: string; down: string; left: string; right: string; interact: string; action: string };
}
export const defaultSettings: Settings = { master: .6, music: .3, sfx: .45, ambient: .15, dialogue: .2, muted: false, musicOn: true, sfxOn: true, ambientOn: false, track: 0, shuffle: false, repeat: true, time: 'local', playerSpeed: 'fast', npcSpeed: 'fast', textSpeed: 'fast', animationSpeed: 'fast', pixelScale: 2, windowScale: 1, cameraSmoothness: .12, shake: true, crt: false, scanlines: false, glow: true, weather: false, reducedMotion: false, damageFlash: true, highContrast: false, violence: 'full', keys: { up: 'w', down: 's', left: 'a', right: 'd', interact: 'e', action: ' ' } };
export type Weapon = 'hand' | 'whip' | 'rifle';
export interface WorldState {
  version: number; company: { id: string; name: string; motto: string; chaos: number; wallColor: string; plants: boolean; goals: string };
  employees: Employee[]; tasks: Task[]; providers: ProviderConfig[]; conversations: Conversation[]; messages: Message[]; reports: Report[]; meetings: Meeting[];
  history: { id: string; employeeId: string; name: string; role: string; status: Employment; createdAt: string }[];
  incidents: { id: string; employeeId: string; weapon: Weapon; text: string; createdAt: string }[];
  events: OfficeEvent[]; settings: Settings; player: Point & { appearance: Appearance; equipped: Weapon; coffee: number; energyDrinks: number; inventory: string[]; caffeinatedUntil?: number };
  savedAt: string; storage: { mode: 'local' | 'supabase'; error?: string; syncedAt?: string; restoreBlocked?: boolean };
}
export type ServerEvent = { type: 'snapshot'; state: WorldState } | { type: 'event'; event: OfficeEvent } | { type: 'world.tick'; employees: Pick<Employee, 'id' | 'position' | 'destination' | 'state' | 'bubble' | 'bubbleUntil'>[]; savedAt: string };
