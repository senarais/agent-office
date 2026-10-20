export type SkillSource = 'project' | 'user' | 'custom';

/** Safe, browser-facing skill metadata. The full playbook stays on the server until preview. */
export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  source: SkillSource;
}

export interface SkillPreview extends SkillSummary {
  content: string;
}
