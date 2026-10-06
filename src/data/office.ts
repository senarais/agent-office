import type { Agent, Task, Settings, Room, Rect, Point, RoomId } from '../types';

export const WORLD = { width: 1040, height: 664, cell: 16 };
export const ROOMS: Room[] = [
  { id: 'research', name: 'Research library', x: 40, y: 88, w: 224, h: 196, color: '#d2bc89' },
  { id: 'developer', name: 'Developer studio', x: 280, y: 88, w: 240, h: 196, color: '#9ec8b7' },
  { id: 'meeting', name: 'Meeting room', x: 536, y: 88, w: 256, h: 196, color: '#aabfd0' },
  { id: 'server', name: 'Utility', x: 808, y: 88, w: 192, h: 196, color: '#9caeb2' },
  { id: 'pantry', name: 'Coffee corner', x: 40, y: 368, w: 224, h: 104, color: '#d4ac7a' },
  { id: 'lounge', name: 'The little lounge', x: 40, y: 480, w: 224, h: 144, color: '#baa4bc' },
  { id: 'design', name: 'Creative corner', x: 280, y: 368, w: 240, h: 256, color: '#c7a6a2' },
  { id: 'workspace', name: 'Open workspace', x: 536, y: 368, w: 256, h: 256, color: '#a7bb96' },
  { id: 'manager', name: 'Director’s office', x: 808, y: 368, w: 192, h: 144, color: '#d4bb82' },
  { id: 'lobby', name: 'Reception', x: 808, y: 528, w: 192, h: 96, color: '#cbbca2' },
];

export interface Furniture extends Rect { kind: 'desk' | 'shelf' | 'plant' | 'table' | 'sofa' | 'coffee' | 'server' | 'printer' | 'jukebox' | 'board' | 'cabinet' | 'rug'; id: string; agentId?: string }
export const FURNITURE: Furniture[] = [
  { id: 'library', kind: 'shelf', x: 56, y: 116, w: 80, h: 24 },
  { id: 'books', kind: 'shelf', x: 152, y: 116, w: 88, h: 24 },
  { id: 'nisa-desk', kind: 'desk', x: 104, y: 188, w: 104, h: 42, agentId: 'nisa' },
  { id: 'plant-a', kind: 'plant', x: 56, y: 236, w: 20, h: 24 },
  { id: 'bima-desk', kind: 'desk', x: 312, y: 152, w: 96, h: 42, agentId: 'bima' },
  { id: 'dev-desk', kind: 'desk', x: 416, y: 152, w: 80, h: 42, agentId: 'bima' },
  { id: 'plant-b', kind: 'plant', x: 472, y: 236, w: 20, h: 24 },
  { id: 'meeting-table', kind: 'table', x: 600, y: 160, w: 128, h: 66 },
  { id: 'plant-c', kind: 'plant', x: 552, y: 124, w: 20, h: 24 },
  { id: 'server-a', kind: 'server', x: 832, y: 124, w: 48, h: 50 },
  { id: 'server-b', kind: 'server', x: 892, y: 124, w: 48, h: 50 },
  { id: 'cabinet', kind: 'cabinet', x: 944, y: 224, w: 32, h: 38 },
  { id: 'whiteboard', kind: 'board', x: 414, y: 286, w: 128, h: 16 },
  { id: 'printer', kind: 'printer', x: 850, y: 304, w: 40, h: 24 },
  { id: 'coffee', kind: 'coffee', x: 64, y: 400, w: 120, h: 32 },
  { id: 'jukebox', kind: 'jukebox', x: 224, y: 400, w: 24, h: 32 },
  { id: 'sofa', kind: 'sofa', x: 64, y: 552, w: 104, h: 40 },
  { id: 'coffee-table', kind: 'table', x: 108, y: 500, w: 56, h: 28 },
  { id: 'plant-d', kind: 'plant', x: 224, y: 576, w: 20, h: 24 },
  { id: 'tita-desk', kind: 'desk', x: 312, y: 432, w: 104, h: 42, agentId: 'tita' },
  { id: 'design-shelf', kind: 'shelf', x: 448, y: 400, w: 48, h: 24 },
  { id: 'plant-e', kind: 'plant', x: 464, y: 560, w: 20, h: 24 },
  { id: 'damar-desk', kind: 'desk', x: 560, y: 432, w: 88, h: 42, agentId: 'damar' },
  { id: 'sari-desk', kind: 'desk', x: 672, y: 432, w: 88, h: 42, agentId: 'sari' },
  { id: 'plant-f', kind: 'plant', x: 744, y: 576, w: 20, h: 24 },
  { id: 'arga-desk', kind: 'desk', x: 840, y: 420, w: 112, h: 42, agentId: 'arga' },
  { id: 'reception', kind: 'desk', x: 840, y: 556, w: 88, h: 36, agentId: 'arga' },
  { id: 'plant-g', kind: 'plant', x: 960, y: 564, w: 20, h: 24 },
];

// Collision footprints are shared by the director and agent navigation.
export const WALLS: Rect[] = [
  { x: 24, y: 76, w: 992, h: 12 }, { x: 24, y: 624, w: 992, h: 14 },
  { x: 24, y: 76, w: 12, h: 562 }, { x: 1004, y: 76, w: 12, h: 562 },
  ...[264, 520, 792].map(x => ({ x, y: 88, w: 12, h: 196 })),
  ...[264, 520, 792].map(x => ({ x, y: 368, w: 12, h: 256 })),
  ...[[40, 96], [192, 72], [280, 64], [408, 112], [536, 80], [696, 96], [808, 48], [920, 80]].map(([x, w]) => ({ x, y: 276, w, h: 10 })),
  ...[[40, 136], [240, 24], [280, 64], [408, 112], [536, 64], [664, 128], [808, 40], [912, 88]].map(([x, w]) => ({ x, y: 358, w, h: 10 })),
];
export const OBSTACLES = [...WALLS, ...FURNITURE.filter(f => f.kind !== 'rug')];
export const MEETING_SPOTS: Point[] = [{ x: 568, y: 184 }, { x: 584, y: 232 }, { x: 632, y: 248 }, { x: 680, y: 248 }, { x: 744, y: 216 }, { x: 744, y: 152 }];
export const roomAt = (p: Point): RoomId => ROOMS.find(r => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)?.id ?? 'lobby';

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 65, musicVolume: 35, sfxVolume: 45, ambience: false, muted: false,
  animationSpeed: 1, simulationSpeed: 1, speechBubbles: true, pathLines: false,
  dayMode: false, uiScale: 1, reducedMotion: false, focusMode: false, autoplay: true,
};

export function initialAgents(): Agent[] {
  const defs = [
    ['arga', 'Arga', 'Team lead', 'Planning', 'Big-picture thinker. Small-coffee enthusiast.', '#e3bc74', '#d6a17c', '#393330', 'manager', 888, 488, 'thinking', 'Let’s make good things.'],
    ['nisa', 'Nisa', 'Research agent', 'Research', 'Curious by default. Always has one more question.', '#9cc7c4', '#d6a17c', '#393638', 'research', 152, 248, 'working', 'Found something interesting!'],
    ['bima', 'Bima', 'Developer agent', 'Development', 'Turns coffee into clean, thoughtful code.', '#a8c989', '#c8916e', '#2e3030', 'developer', 360, 216, 'working', 'One more tiny commit…'],
    ['tita', 'Tita', 'Design agent', 'Design', 'Believes everything deserves a little character.', '#d1a0bc', '#edbc99', '#704634', 'design', 360, 504, 'working', 'What if we add a little green?'],
    ['damar', 'Damar', 'QA agent', 'Quality', 'Finds the edge case before the edge finds you.', '#9daee0', '#d09e80', '#40362c', 'workspace', 600, 504, 'blocked', 'A little input, please?'],
    ['sari', 'Sari', 'Operations agent', 'Operations', 'Keeps the office, and everyone in it, in sync.', '#dbaa80', '#deb28c', '#483329', 'workspace', 712, 504, 'walking', 'Coffee mission complete. Back to it!'],
  ] as const;
  return defs.map(([id, name, role, specialty, personality, color, skin, hair, room, x, y, state, bubble]) => ({
    id, name, role, specialty, personality, color, skin, hair, room: id === 'sari' ? 'pantry' : room,
    home: { x, y }, position: id === 'sari' ? { x: 200, y: 456 } : { x, y }, destination: { x, y }, state,
    paused: false, mood: id === 'damar' ? 68 : 86 + name.length, bubble, stateUntil: 0,
  }));
}

export function initialTasks(): Task[] {
  const now = Date.now();
  return [
    { id: 'T-101', title: 'Explore the competitive landscape', description: 'Research three inspiring products and summarize opportunities for our next release.', agentId: 'nisa', type: 'Research', priority: 'High', status: 'doing', progress: 64 },
    { id: 'T-102', title: 'Build something delightful', description: 'Create the first interactive prototype for the new company website.', agentId: 'bima', type: 'Development', priority: 'High', status: 'doing', progress: 42 },
    { id: 'T-103', title: 'A fresh look for our landing page', description: 'Explore a warm visual direction with a clear hierarchy and thoughtful interactions.', agentId: 'tita', type: 'Design', priority: 'Medium', status: 'doing', progress: 76 },
    { id: 'T-104', title: 'Check the onboarding flow', description: 'Waiting for your decision: should the welcome tour be optional? Resume to approve an optional tour.', agentId: 'damar', type: 'Quality', priority: 'High', status: 'blocked', progress: 28 },
    { id: 'T-105', title: 'Keep our weekly plans in sync', description: 'Prepare the team calendar and a concise weekly operations summary.', agentId: 'sari', type: 'Operations', priority: 'Low', status: 'doing', progress: 55 },
    { id: 'T-106', title: 'Plan our next little big thing', description: 'Review the roadmap and identify the most meaningful next step.', agentId: 'arga', type: 'Planning', priority: 'Medium', status: 'todo', progress: 0 },
    { id: 'T-107', title: 'Make the design system shine', description: 'Document the foundational colors, spacing, and reusable components.', agentId: 'tita', type: 'Design', priority: 'Low', status: 'todo', progress: 0 },
    { id: 'T-108', title: 'The Monday morning briefing', description: 'A short, actionable summary to start the week.', agentId: 'arga', type: 'Planning', priority: 'Medium', status: 'done', progress: 100, completedAt: now - 420000, output: 'Monday briefing\n\n• Research, development, and design are progressing.\n• QA needs a decision on the optional welcome tour.\n• Next step: align on the landing page direction in our next team huddle.\n\nPrepared locally by Arga · Simulated team report' },
    { id: 'T-109', title: 'Organize the research library', description: 'Make our knowledge a little easier to find.', agentId: 'nisa', type: 'Research', priority: 'Low', status: 'done', progress: 100, completedAt: now - 720000, output: 'Research library update\n\nResources grouped into Product, Design, Engineering, and Market Research. Six outdated links flagged for review.\n\nNext step: add a short summary to each new research note.\n\nPrepared locally by Nisa · Simulated team report' },
  ].map((t, i) => ({ ...t, createdAt: now - (9 - i) * 120000 } as Task));
}
