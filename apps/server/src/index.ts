import 'dotenv/config';
import { createApp } from './api';

const { app, engine } = await createApp();
// Environment keys are imported into the encrypted local vault once; never serialized to the game.
if (process.env.OPENAI_API_KEY && !engine.s.providers.some(p => p.kind === 'openai')) await engine.configureProvider({ name: 'OpenAI', kind: 'openai', apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-4.1-mini' });
if (process.env.OPENCODE_URL && !engine.s.providers.some(p => p.kind === 'opencode')) await engine.configureProvider({ name: 'OpenCode local', kind: 'opencode', baseUrl: process.env.OPENCODE_URL, apiKey: process.env.OPENCODE_SERVER_PASSWORD });
if (process.env.GENERIC_BASE_URL && !engine.s.providers.some(p => p.kind === 'generic')) await engine.configureProvider({ name: 'Compatible endpoint', kind: 'generic', baseUrl: process.env.GENERIC_BASE_URL, apiKey: process.env.GENERIC_API_KEY, model: process.env.GENERIC_MODEL || '' });
await app.listen({ port: Number(process.env.PORT) || 3001, host: '127.0.0.1' });
console.log('PT ABISENA RAIS JAYA · local agent server http://127.0.0.1:' + (process.env.PORT || 3001));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
