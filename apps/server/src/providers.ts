import OpenAI from 'openai';
import { createOpencodeClient } from '@opencode-ai/sdk';
import type { ProviderConfig, Secret, Usage } from '../../../packages/shared/src/types';

export interface AgentRequest {
  model: string; system: string; messages: { role: 'user' | 'assistant'; content: string }[];
  signal: AbortSignal; sessionId?: string; projectPath?: string; tools: string[];
  onSession: (id: string) => void; onText: (text: string) => void;
  onActivity: (activity: 'working' | 'reading' | 'terminal' | 'waiting', detail: string) => void;
}
export interface AgentProvider { listModels(): Promise<string[]>; execute(request: AgentRequest): Promise<{ text: string; usage?: Usage }> }

class OpenAIProvider implements AgentProvider {
  client: OpenAI;
  constructor(config: ProviderConfig, secret: Secret) {
    if (config.kind === 'openai' && !secret.apiKey) throw new Error('OpenAI API key is missing. A ChatGPT subscription is not an API credential.');
    this.client = new OpenAI({ apiKey: secret.apiKey || 'local', baseURL: config.kind === 'generic' ? config.baseUrl : undefined, defaultHeaders: secret.headers, timeout: 120000, maxRetries: 1 });
  }
  async listModels() { const response = await this.client.models.list({ signal: AbortSignal.timeout(15000) }); return response.data.map(m => m.id).sort(); }
  async execute(r: AgentRequest) {
    // Text-only providers do not claim to execute tools. OpenCode owns actual tool execution.
    const stream = await this.client.chat.completions.create({ model: r.model, messages: [{ role: 'system', content: r.system + '\nYou have no filesystem, browser, or execution tools in this connection. Never claim to have used unavailable tools.' }, ...r.messages], stream: true, ...(this.client.baseURL.includes('api.openai.com') ? { stream_options: { include_usage: true } } : {}) }, { signal: r.signal });
    let text = ''; let usage: Usage | undefined;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta.content;
      if (delta) { text += delta; r.onText(delta); }
      if (chunk.usage) usage = { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens, totalTokens: chunk.usage.total_tokens };
    }
    if (!text.trim()) throw new Error('Provider returned an empty response. Check model capabilities.');
    return { text, usage };
  }
}

class OpenCodeProvider implements AgentProvider {
  constructor(private config: ProviderConfig, private secret: Secret) {}
  private client(directory?: string) {
    return createOpencodeClient({ baseUrl: this.config.baseUrl || 'http://127.0.0.1:4096', directory: directory || undefined, headers: { ...this.secret.headers, ...(this.secret.apiKey ? { Authorization: `Basic ${Buffer.from(`opencode:${this.secret.apiKey}`).toString('base64')}` } : {}) }, throwOnError: true });
  }
  async listModels() {
    const response = await this.client().config.providers({ signal: AbortSignal.timeout(15000) });
    return response.data!.providers.flatMap(p => Object.keys(p.models).map(m => `${p.id}/${m}`));
  }
  async execute(r: AgentRequest) {
    const client = this.client(r.projectPath);
    const sessionId = r.sessionId || (await client.session.create({ body: { title: 'PT Abisena · employee workspace' }, signal: r.signal })).data!.id;
    r.onSession(sessionId);
    const stopEvents = new AbortController(); let streamed = ''; const seen = new Map<string, string>();
    const abort = () => { void client.session.abort({ path: { id: sessionId } }).catch(() => {}); stopEvents.abort(); };
    r.signal.addEventListener('abort', abort, { once: true });
    const eventLoop = (async () => {
      try {
        const events = await client.event.subscribe({ signal: stopEvents.signal });
        for await (const event of events.stream) {
          if (event.type === 'message.part.updated') {
            const part = event.properties.part; if (part.sessionID !== sessionId) continue;
            if (part.type === 'text') { const before = seen.get(part.id) || ''; const delta = part.text.slice(before.length); seen.set(part.id, part.text); if (delta) { streamed += delta; r.onText(delta); } }
            if (part.type === 'tool') r.onActivity(/read|search|grep|glob|web/.test(part.tool) ? 'reading' : /bash|terminal/.test(part.tool) ? 'terminal' : 'working', `Tool: ${part.tool} (${part.state.status})`);
          }
          if (event.type === 'permission.updated' && event.properties.sessionID === sessionId) r.onActivity('waiting', 'OpenCode needs permission. Approve in the OpenCode client, or cancel here.');
        }
      } catch (error) { if (!stopEvents.signal.aborted) r.onActivity('working', `Event stream unavailable; waiting for final response. ${(error as Error).message}`); }
    })();
    try {
      const slash = r.model.indexOf('/');
      const availableTools = (await client.tool.ids({ signal: r.signal })).data!;
      const allowed = Object.fromEntries([...new Set([...availableTools, 'bash', 'edit', 'write', 'read', 'glob', 'grep', 'webfetch', 'task', 'todowrite', 'question'])].map(t => [t, r.tools.includes(t)]));
      const response = await client.session.prompt({ path: { id: sessionId }, signal: r.signal, body: { system: r.system, ...(slash > 0 ? { model: { providerID: r.model.slice(0, slash), modelID: r.model.slice(slash + 1) } } : {}), tools: allowed, parts: [{ type: 'text', text: r.messages.at(-1)!.content }] } });
      const data = response.data!;
      if (data.info.error) throw new Error(JSON.stringify(data.info.error));
      const text = data.parts.filter(p => p.type === 'text').map(p => p.type === 'text' ? p.text : '').join('\n');
      if (!streamed && text) r.onText(text);
      if (!text.trim()) throw new Error('OpenCode returned no text. Inspect its session and permission requests.');
      return { text, usage: { inputTokens: data.info.tokens.input, outputTokens: data.info.tokens.output, totalTokens: data.info.tokens.input + data.info.tokens.output, cost: data.info.cost } };
    } finally { stopEvents.abort(); r.signal.removeEventListener('abort', abort); await eventLoop; }
  }
}

class DemoProvider implements AgentProvider {
  async listModels() { return ['demo-simulation']; }
  async execute(r: AgentRequest) {
    const text = `DEMO SIMULATION — no AI provider was called.\n\nReceived: ${r.messages.at(-1)?.content}\n\nThis response tests walking, streaming, persistence and report delivery only.`;
    for (const word of text.match(/.{1,18}/gs) || []) { r.signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 45)); r.onText(word); }
    return { text };
  }
}
export function createProvider(config: ProviderConfig, secret: Secret): AgentProvider {
  if (!config.enabled) throw new Error('Provider disabled. Re-enable it at the IT terminal.');
  if (config.kind === 'demo') { if (process.env.ENABLE_DEMO_PROVIDER !== 'true') throw new Error('Demo provider disabled on server'); return new DemoProvider(); }
  if (config.kind === 'opencode') return new OpenCodeProvider(config, secret);
  return new OpenAIProvider(config, secret);
}
export function safeError(error: unknown, secrets: string[] = []): string {
  if (error instanceof Error && error.name === 'AbortError') return 'Request cancelled';
  let text = String(error instanceof Error ? error.message : error);
  for (const secret of secrets.filter(Boolean)) text = text.split(secret).join('[redacted]');
  return text.replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 1500);
}
