import type { Schedule } from './automation';
import type { SocialMediaType, SocialPlatform } from './social';

export type WorkflowStepKind = 'agent' | 'social-plan';
export type WorkflowRunStatus = 'queued' | 'running' | 'waiting_approval' | 'revision' | 'completed' | 'failed' | 'cancelled' | 'skipped';
export type WorkflowStepStatus = 'pending' | 'queued' | 'running' | 'awaiting_approval' | 'revision' | 'approved' | 'completed' | 'failed' | 'skipped' | 'cancelled';
export type SocialPlanStatus = 'proposed' | 'approved' | 'publishing' | 'published' | 'failed' | 'cancelled';

export interface WorkflowTaskRef {
  workflowId: string;
  runId: string;
  stepRunId: string;
}

/** A step definition is snapshotted into every run so edits cannot rewrite work already in flight. */
export interface WorkflowStep {
  id: string;
  name: string;
  employeeId: string;
  instructions: string;
  expectedOutput: string;
  tools: string[];
  dependsOn: string[];
  requiresApproval: boolean;
  kind: WorkflowStepKind;
  platform?: SocialPlatform;
  expectedPosts?: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  preset?: string;
  steps: WorkflowStep[];
  timezone: string;
  schedule: Schedule | null;
  enabled: boolean;
  pausedReason?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  telegramNotify: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface WorkflowStepRun {
  id: string;
  stepId: string;
  name: string;
  employeeId: string;
  instructions: string;
  expectedOutput: string;
  tools: string[];
  dependsOn: string[];
  requiresApproval: boolean;
  kind: WorkflowStepKind;
  platform?: SocialPlatform;
  expectedPosts?: number;
  status: WorkflowStepStatus;
  taskId?: string;
  reportId?: string;
  output: string;
  error?: string;
  feedback?: string;
  approvalNote?: string;
  revisionCount: number;
  approvedBy?: 'director' | 'telegram';
  approvedAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  brief: string;
  scheduledAt: string;
  status: WorkflowRunStatus;
  steps: WorkflowStepRun[];
  errors: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

/** One approved/proposed post in a workflow-generated schedule. */
export interface SocialPlanItem {
  id: string;
  workflowId: string;
  runId: string;
  stepRunId: string;
  platform: SocialPlatform;
  scheduledAt: string;
  caption: string;
  hashtags: string[];
  mediaType: SocialMediaType;
  mediaUrl?: string;
  imagePrompt?: string;
  videoPrompt?: string;
  status: SocialPlanStatus;
  publishId?: string;
  externalId?: string;
  url?: string;
  error?: string;
  attempts: number;
  nextRetryAt?: string;
  createdAt: string;
  publishedAt?: string;
}

export interface ParsedSocialPlanItem {
  time?: string;
  scheduledAt?: string;
  caption: string;
  hashtags: string[];
  mediaType: SocialMediaType;
  mediaUrl?: string;
  imagePrompt?: string;
  videoPrompt?: string;
}

export interface WorkflowPresetStep extends Omit<WorkflowStep, 'id'> {
  key: string;
}

export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  steps: WorkflowPresetStep[];
}

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const list = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 12)
  : typeof value === 'string'
    ? value.split(/[\s,]+/).map(item => item.trim()).filter(Boolean).slice(0, 12)
    : [];

/** Parse an LLM posting schedule, tolerating fences and common wrapper keys. No prose fallback: a schedule must be real. */
export function parseSocialPlan(input: string, max = 12): ParsedSocialPlanItem[] {
  const clean = input.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const parse = (value: string): unknown => { try { return JSON.parse(value); } catch { return undefined; } };
  let value = parse(clean);
  if (value === undefined) {
    const start = clean.search(/[[{]/);
    const end = Math.max(clean.lastIndexOf(']'), clean.lastIndexOf('}'));
    if (start >= 0 && end > start) value = parse(clean.slice(start, end + 1));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const wrapper = value as Record<string, unknown>;
    value = Array.isArray(wrapper.posts) ? wrapper.posts
      : Array.isArray(wrapper.schedule) ? wrapper.schedule
        : Array.isArray(wrapper.items) ? wrapper.items
          : Array.isArray(wrapper.plan) ? wrapper.plan
            : Array.isArray(wrapper.options) ? wrapper.options
              : value;
  }
  const items = Array.isArray(value) ? value : [];
  const posts: ParsedSocialPlanItem[] = [];
  for (const raw of items.slice(0, max)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const caption = text(item.caption ?? item.copy ?? item.text ?? item.post ?? item.content, 4000);
    if (!caption) continue;
    const rawTime = text(item.time ?? item.at ?? item.scheduledAt ?? item.scheduled_at ?? item.iso, 60);
    const media = text(item.mediaType ?? item.media_type ?? item.media ?? item.type, 20).toLowerCase();
    posts.push({
      caption,
      hashtags: list(item.hashtags ?? item.tags),
      mediaType: media.includes('video') ? 'video' : media.includes('image') || media.includes('photo') || media.includes('picture') ? 'image' : 'text',
      time: /^\d{1,2}:\d{2}$/.test(rawTime) ? rawTime.padStart(5, '0') : undefined,
      scheduledAt: /^\d{4}-\d{2}-\d{2}T/.test(rawTime) ? rawTime : undefined,
      mediaUrl: text(item.mediaUrl ?? item.media_url ?? item.url, 1200) || undefined,
      imagePrompt: text(item.imagePrompt ?? item.image_prompt ?? item.prompt, 2000) || undefined,
      videoPrompt: text(item.videoPrompt ?? item.video_prompt, 2000) || undefined,
    });
  }
  return posts;
}

function localParts(timestamp: number, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(timestamp))) if (part.type !== 'literal') parts[part.type] = part.value;
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) };
}

function zonedTimestamp(year: number, month: number, day: number, hour: number, minute: number, timezone: string) {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = target;
  for (let pass = 0; pass < 2; pass++) {
    const parts = localParts(guess, timezone);
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    guess += target - actual;
  }
  return guess;
}

/**
 * Resolve an agent's posting time into a real UTC timestamp. Times are interpreted in the
 * workflow timezone; a past time rolls to the next day so an approved schedule never fires
 * a burst of late posts. Missing time means one minute from now (visible, not silent).
 */
export function resolvePlanTime(item: ParsedSocialPlanItem, after: number, timezone = 'UTC'): string {
  if (item.scheduledAt) {
    const at = Date.parse(item.scheduledAt);
    if (Number.isFinite(at)) return new Date(at).toISOString();
  }
  if (item.time) {
    try {
      const [hour, minute] = item.time.split(':').map(Number);
      if (Number.isFinite(hour) && Number.isFinite(minute)) {
        const today = localParts(after, timezone);
        let candidate = zonedTimestamp(today.year, today.month, today.day, hour, minute, timezone);
        if (candidate <= after) candidate = zonedTimestamp(today.year, today.month, today.day + 1, hour, minute, timezone);
        return new Date(candidate).toISOString();
      }
    } catch { /* fall through to the honest immediate slot */ }
  }
  return new Date(after + 60000).toISOString();
}

const socialPlanFormat = (platform: string, timezone: string, expected: number) => `Return ONLY valid JSON (no markdown fences, no commentary) in this shape:
{"posts":[{"time":"09:00","caption":"platform-ready caption","hashtags":["#tag"],"mediaType":"text|image|video","imagePrompt":"optional visual prompt","mediaUrl":"optional existing https URL"}]}
Rules: produce ${expected} posts for ${platform.toUpperCase()}; times are HH:MM in ${timezone}; spread them across the day; captions must fit the platform; never invent facts that are not in the brief or research; text-only posts are valid.${platform === 'instagram' ? ' Instagram needs media, so include mediaUrl or imagePrompt for every post.' : ''}`;

const base = { tools: [] as string[], requiresApproval: false, kind: 'agent' as const };

const dailyResearchPrompt = `Kamu adalah trend scout untuk akun X ini. Kumpulkan bahan mentah untuk 8 tweet hari ini, lalu serahkan 12–15 kandidat ke director. JANGAN menulis caption final di step ini.

ALAT & SUMBER
- Baca .agents/skills/agent-reach/SKILL.md dan ikuti routing-nya. Jika CLI agent-reach tidak tersedia, jangan mengklaim memakainya; gunakan scripts/x-scroll.mjs yang membaca profil X yang sudah login.
- Jalankan tepat 5 perintah X, berurutan (jangan paralel). Tiap perintah punya timeout; kalau gagal, lanjut ke perintah berikutnya dan catat kegagalannya.
  1. node scripts/x-scroll.mjs --mode user --user direkturcrypto --scrolls 2 --limit 20
  2. node scripts/x-scroll.mjs --mode user --user itsjdraven --scrolls 2 --limit 20
  3. node scripts/x-scroll.mjs --mode user --user pengsonal --scrolls 2 --limit 20
  4. node scripts/x-scroll.mjs --mode search --query "(from:openai OR from:GoogleDeepMind OR from:AnthropicAI OR from:claudeai OR from:opencode OR from:GeminiApp) -filter:replies" --scrolls 2 --limit 30
  5. node scripts/x-scroll.mjs --mode search --query "(AI meme OR tech meme OR meme indonesia OR shitpost indonesia) -filter:replies" --scrolls 2 --limit 25
- Jalankan langsung dan baca stdout. JANGAN redirect output ke /tmp atau file lain. Jangan menjalankan lebih dari 5 perintah X.
- Verifikasi klaim penting dengan webfetch/curl ke sumber primer (timeout 20s). Maksimal 4 link. Jangan membuat loop tanpa batas.
- Total budget 12 menit. Kalau X error atau hasilnya sedikit, jujur sebutkan dan pakai berita AI terverifikasi dari sumber primer sebagai pengganti.

YANG DICARI
- 24 jam terakhir (48–72 jam hanya kalau masih segar).
- AI: model/agent baru, rilis lab (OpenAI, Google/Gemini, Anthropic/Claude, opencode, dll), dev tools, open source, security/privacy, consumer tech.
- Meme terbaru: global dan Indonesia, format/tren lucu yang sedang ramai — bukan cuma berita.
- Minimal 12, maksimal 15 kandidat. Boleh lebih dari 10; jangan paksakan yang lemah.
- Prioritaskan fakta spesifik dari post X asli. Skip politik, shilling harga crypto, engagement bait, dan topik basi.

OUTPUT (Bahasa Indonesia, maks 1800 kata)
1. Lima bullet: apa yang benar-benar ramai di X hari ini, dengan bukti.
2. 12–15 kandidat bernomor. Tiap kandidat: [NEWS|MEME|AI|TOOL|QUESTION] · fakta inti 1 kalimat · sumber primer URL · bukti X URL + @author + waktu + metrik terlihat · angle/hook · kenapa sekarang. Untuk meme, jelaskan format/joke-nya, bukan cuma "viral".
3. Rekomendasi 8 terbaik + komposisi (berapa news, meme, AI, question).
4. Gap: apa yang tidak bisa diverifikasi.

Gaya: Indonesia santai, to the point, boleh "gajelas"/absurd untuk meme, tapi fakta tetap benar. Jangan mengarang post, metrik, URL, atau tool use. Agent berikutnya menulis tweet final dari handoff ini.`;
const dailyWriterPrompt = `Kamu adalah ghostwriter X. Ubah handoff riset menjadi 8 tweet siap publish + jadwal. Jangan riset ulang, jangan buka X, jangan browsing. Kalau director memberi "selected items"/approval note, PAKAI HANYA item yang dipilih. Kalau tidak ada, pilih 8 terbaik dari handoff.

SKILLS
- Baca dan terapkan .agents/skills/social-media-context-sms/SKILL.md, post-writer-sms, hook-writer-sms, platform-strategy-sms, dan content-pattern-analyzer-sms. Baca file yang relevan dengan tool read.

BAHASA & VOICE
- Bahasa Indonesia santai, to the point. Bukan bahasa brand, newsletter, atau korporat.
- Satu ide per tweet, baris pendek. Tanpa "BREAKING", tanpa "Jadi gini...", tanpa hashtag kecuali benar-benar natural (default []).
- Gaya "gajelas" boleh: absurd, dry, typo lucu, reaksi berlebihan — tapi tetap nyambung ke fakta dan tidak menyinggung.
- Istilah teknis (LLM, GPU, open source) boleh tetap Inggris.
- Hard limit 280 karakter per caption. Hitung sebelum return.
- Emoji secukupnya (😭 👀 🔥), jangan ditumpuk.
- Fakta hanya dari handoff. Jangan mengarang angka, kutipan, cerita pribadi, atau URL.

MIX (tepat 8 post)
- 3 berita/AI: fakta konkret + kenapa penting, bahasa manusia.
- 2 meme/reaksi: energi shitpost dari meme asli (global atau Indonesia).
- 1 pertanyaan/comparison singkat.
- 1 list/retrospective.
- 1 tool/discovery under-the-radar.
Jangan jadikan semuanya news summary. Tidak boleh ada topik atau opener yang duplikat.

JADWAL
- Asia/Jakarta, tiap 2 jam: 07:00, 09:00, 11:00, 13:00, 15:00, 17:00, 19:00, 21:00.
- Berita time-sensitive di pagi; meme/pertanyaan di slot engagement.

OUTPUT
Return ONLY valid JSON, no markdown, no commentary:
{"posts":[{"time":"07:00","caption":"final tweet text","hashtags":[],"mediaType":"text"}]}
Tepat 8 item. caption adalah teks final yang dipublish, bukan deskripsi. mediaType "text" kecuali handoff punya URL gambar/video asli. hashtags biasanya [].
Sebelum return, cek: 8 item, JSON valid, tiap caption <=280 karakter, mix sesuai brief, tidak ada topik duplikat.`;

export const workflowPresets: WorkflowPreset[] = [
  {
    id: 'social-daily',
    name: 'Daily social media posting',
    description: 'Riset tren, meme, dan update AI dari akun X pilihan, tunggu director memilih kandidat, lalu susun jadwal 8 tweet berbahasa Indonesia untuk approval.',
    steps: [
      {
        ...base, key: 'research', name: 'Riset tren, meme & update AI', employeeId: '', requiresApproval: true,
        instructions: dailyResearchPrompt,
        expectedOutput: 'Handoff Bahasa Indonesia: 12–15 kandidat tweet bernomor dengan fakta, URL sumber, bukti X, angle, dan komposisi 8 terbaik.', dependsOn: [],
      },
      {
        ...base, key: 'schedule', name: 'Susun jadwal tweet', employeeId: '', kind: 'social-plan', platform: 'x', expectedPosts: 8,
        instructions: dailyWriterPrompt,
        expectedOutput: 'JSON valid: 8 caption final Bahasa Indonesia dengan jam HH:MM Asia/Jakarta.', dependsOn: ['research'], requiresApproval: true,
      },
    ],
  },
  {
    id: 'research-program',
    name: 'Research → new program',
    description: 'Research the project, propose a new program, then submit an implementation plan for approval.',
    steps: [
      {
        ...base, key: 'research', name: 'Research the project', employeeId: '',
        instructions: 'Investigate the current project state, existing features and constraints. Use read/glob/grep or webfetch when available. Return an evidence-backed brief that clearly separates observed facts from assumptions.',
        expectedOutput: 'A research brief with observed facts, constraints and opportunities.', dependsOn: [],
      },
      {
        ...base, key: 'proposal', name: 'Design the program proposal', employeeId: '',
        instructions: 'Turn the research brief into one concrete program proposal: user problem, outcome, scope, required agents/divisions, dependencies and risks. Keep it actionable and honest about unknowns.',
        expectedOutput: 'A concrete program proposal.', dependsOn: ['research'],
      },
      {
        ...base, key: 'plan', name: 'Implementation plan', employeeId: '', requiresApproval: true,
        instructions: 'Produce an implementation plan for the proposal: ordered milestones, owners by department, acceptance checks and rollback notes. This plan is sent to the director for approval.',
        expectedOutput: 'An approvable implementation plan with milestones and acceptance checks.', dependsOn: ['proposal'],
      },
    ],
  },
];

export function instantiatePreset(presetId: string): { name: string; description: string; preset: string; steps: WorkflowStep[] } | undefined {
  const preset = workflowPresets.find(item => item.id === presetId);
  if (!preset) return undefined;
  return {
    name: preset.name,
    description: preset.description,
    preset: preset.id,
    steps: preset.steps.map(step => ({ ...step, id: step.key })),
  };
}

export function socialPlanPrompt(step: { platform?: SocialPlatform }, timezone: string, count: number) {
  return `\n\n${socialPlanFormat(step.platform || 'x', timezone, count)}`;
}
