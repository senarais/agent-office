import type { Agent, Task, OfficeEvent, Meeting } from '../types';
import { MEETING_SPOTS } from '../data/office';

export const uid = (prefix = 'id') => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
export const makeEvent = (type: OfficeEvent['type'], text: string, agentId?: string): OfficeEvent => ({ id: uid('event'), type, text, agentId, time: Date.now() });
export const workingTask = (tasks: Task[], agentId: string) => tasks.find(t => t.agentId === agentId && (t.status === 'doing' || t.status === 'blocked'));
const near = (a: Agent, p = a.destination) => Math.hypot(a.position.x - p.x, a.position.y - p.y) < 16;

export function createReport(task: Task, agent: Agent): string {
  const findings = {
    Development: ['Interactive prototype assembled with reusable components.', 'Keyboard interactions and responsive layouts checked.', 'Next step: ask QA to test edge cases before the next iteration.'],
    Research: ['Three comparable product approaches mapped.', 'Clarity, quick feedback, and approachable design are the strongest opportunities.', 'Next step: validate these hypotheses with a small user study.'],
    Design: ['Warm colors, readable typography, and consistent spacing explored.', 'Primary flow includes hover, empty, loading, and success states.', 'Next step: review the visual direction with the director.'],
    Quality: ['Happy path, keyboard navigation, and empty states reviewed.', 'Potential issue: verify narrow-screen overflow in the next real build.', 'Next step: prioritize a browser-based regression pass.'],
    Operations: ['Weekly priorities grouped by owner and urgency.', 'Open dependencies highlighted for the next team huddle.', 'Next step: confirm owners and communicate the updated plan.'],
    Planning: ['Team priorities aligned around one small, useful milestone.', 'Research → design → development → QA handoff mapped.', 'Next step: review the team’s output and choose the next iteration.'],
  };
  return `${task.title}\n\nBrief\n${task.description || 'Complete the assigned work and share a concise summary.'}\n\nSimulated findings\n${findings[task.type].map(s => `• ${s}`).join('\n')}\n\nPrepared by ${agent.name} · ${agent.role}\nLocal simulation — illustrative output, not actual research or executed code.`;
}

export function advanceSimulation(agents: Agent[], tasks: Task[], meetings: Meeting[], now: number, dt: number) {
  const nextAgents = agents.map(a => ({ ...a }));
  const nextTasks = tasks.map(t => ({ ...t }));
  const nextMeetings = meetings.map(m => ({ ...m }));
  const events: OfficeEvent[] = [];
  for (const meeting of nextMeetings) {
    if (meeting.active && now >= meeting.endsAt) {
      meeting.active = false;
      meeting.notes = 'Team check-in complete. Each agent shared their current work. Keep scope small, unblock QA, and bring finished reports to the director.';
      events.push(makeEvent('meeting.ended', 'Team huddle wrapped up. Notes are ready.'));
      nextAgents.filter(a => meeting.agentIds.includes(a.id)).forEach(a => { a.state = 'walking'; a.destination = a.home; a.bubble = 'Back to making things!'; });
    }
  }
  for (const agent of nextAgents) {
    if (agent.paused) continue;
    const meeting = nextMeetings.find(m => m.active && m.agentIds.includes(agent.id));
    if (meeting) {
      agent.destination = MEETING_SPOTS[meeting.agentIds.indexOf(agent.id) % MEETING_SPOTS.length];
      agent.state = near(agent) ? 'in meeting' : 'walking';
      agent.bubble = 'Let’s sync up.';
      continue;
    }
    if (agent.stateUntil > now && ['on break', 'chatting', 'task complete', 'thinking', 'walking'].includes(agent.state)) {
      if (!near(agent)) agent.state = 'walking';
      else if (agent.room === 'pantry') agent.state = 'on break';
      continue;
    }
    let task = workingTask(nextTasks, agent.id);
    if (task?.status === 'blocked') { agent.state = 'blocked'; continue; }
    if (!task) {
      task = nextTasks.filter(t => t.agentId === agent.id && t.status === 'todo')
        .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] - { High: 0, Medium: 1, Low: 2 }[b.priority]))[0];
      if (task) {
        task.status = 'doing';
        agent.destination = agent.home;
        agent.bubble = 'On it!';
        events.push(makeEvent('task.started', `${agent.name} started “${task.title}”`, agent.id));
      }
    }
    if (task) {
      agent.destination = nextAgents.find(a => a.specialty === task.type)?.home ?? agent.home;
      if (!near(agent)) { agent.state = 'walking'; continue; }
      agent.state = 'working';
      task.progress = Math.min(100, task.progress + dt / 1000 * (0.32 + agent.id.length * 0.025));
      if (task.progress >= 100) {
        task.status = 'review';
        task.output = createReport(task, agent);
        agent.state = 'task complete';
        agent.destination = { x: 952, y: 504 };
        agent.stateUntil = now + 16000;
        agent.mood = Math.min(100, agent.mood + 3);
        agent.bubble = 'Ready for your review!';
        events.push(makeEvent('report.generated', `${agent.name} finished “${task.title}” — report ready`, agent.id));
      }
    } else {
      if (!near(agent)) { agent.state = 'walking'; continue; }
      agent.state = 'idle';
      // Staggered idle routines; no frame-dependent randomness.
      if (now > agent.stateUntil + 24000) {
        agent.destination = agent.room === 'pantry' ? agent.home : { x: 200, y: 456 };
        agent.state = 'walking';
        agent.stateUntil = now + 22000;
        agent.bubble = agent.room === 'pantry' ? 'Refueled. Ready.' : 'A little coffee break?';
        agent.mood = Math.min(100, agent.mood + 2);
      }
    }
  }
  nextAgents.forEach((a, i) => {
    if (a.state !== agents[i].state && a.state !== 'walking') events.push(makeEvent('agent.state.changed', `${a.name} is ${a.state}`, a.id));
  });
  return { agents: nextAgents, tasks: nextTasks, meetings: nextMeetings, events };
}
