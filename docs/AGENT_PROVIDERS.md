# Connect real agents

All connections originate from the local Node backend. The game receives streaming events and saved results, never provider API keys.

## OpenAI API

1. Create an API key at https://platform.openai.com/api-keys and enable API billing/access for the model you want.
2. In-game: walk to **IT / Agent Network → E → Add provider → OpenAI API**.
3. Enter key, save, then **Test connection**. This calls the real models endpoint. Invalid credentials/offline errors appear in the pixel terminal.
4. **Inspect models**. Some returned models are not chat-completion models; choose a model supporting Chat Completions text streaming, e.g. an available `gpt-4.1-mini`.
5. HR → Edit employee → Agent connection → choose provider and model.
6. Talk to employee and send a message. Reply streams into the dialogue window. Cancel aborts the request; completed/partial/error messages persist.

Environment alternative imports a default connection on startup when none of that kind exists:

```dotenv
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4.1-mini
```

Changing `.env` after an existing connection has been imported does not overwrite your saved in-game settings; edit it at IT. Blank secret fields retain saved encrypted secrets.

**ChatGPT Plus/Pro subscriptions and API billing may be separate.** No ChatGPT login/OAuth or subscription-sharing flow is fabricated here.

Implementation: official `openai` SDK; Chat Completions streaming, abort signal, real token metadata when returned. Text-only mode explicitly tells the model it has no filesystem/browser tools. Runtime/tool work is delegated to OpenCode below.

## OpenCode

Install/configure current OpenCode using https://opencode.ai/docs/. Authenticate its own AI providers with its supported commands/UI.

From the project the developer employee should work in:

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

Then configure at IT:

- Type: **OpenCode server**
- Base URL: `http://127.0.0.1:4096`
- Optional password: value of `OPENCODE_SERVER_PASSWORD` used by your OpenCode server (username `opencode`)
- Test connection to discover `provider/model` choices.

Environment alternative:

```dotenv
OPENCODE_URL=http://127.0.0.1:4096
OPENCODE_SERVER_PASSWORD=
```

Assign employee to **Development** in HR. Select an exposed provider/model and allowed tools. Default tool permissions are empty. Tools include `read`, `glob`, `grep`, `webfetch`, `bash`, `write`, `edit`, `task`, `todowrite`, `question`.

Task example:

```text
Title: Add CSV export
Instructions: Inspect the existing project. Add CSV export using its patterns.
Expected output: Changed files, verification results and a concise summary.
Project path: /absolute/path/to/project
Tools: read, glob, grep, edit, write, bash
```

Employee walks to their desk. Official `@opencode-ai/sdk` creates a session and sends the real prompt. Session ID persists on the task/conversation. SDK event stream maps text/tool activity into reading, typing, terminal, and needs-permission states. Final returned text is authoritative if streaming is unavailable.

### Permissions and cancellation

- OpenCode has actual access to the server's selected workspace. Grant only tools you intend to allow.
- Runtime permission prompts show **Needs permission** in-game. Use the OpenCode client attached to that server to approve/deny. In-game cancellation calls the SDK's session abort endpoint where possible.
- Work can be queued while another assignment runs. The local engine serializes employee tasks.
- Chat uses a separate persisted conversation session, so quick conversations do not destroy a coding task session.
- Pausing cancels active generation and preserves session/context. Retry sends another provider turn. It does not rewind filesystem changes or guarantee providers can stop already-launched external tools.
- Editing agent configuration is blocked while the employee has a running request. Firing/death cancels active requests and prevents all new execution.

### Troubleshooting

`ECONNREFUSED` / offline: check OpenCode is running on the configured host/port. Model errors: test again and select a `provider/model` available in that OpenCode instance. Workspace errors: use an absolute existing path with the necessary local permissions. Event stream error: the game keeps waiting for the real final response rather than inventing progress.

SDK reference: https://opencode.ai/docs/sdk/ · Server: https://opencode.ai/docs/server/

## OpenAI-compatible endpoints

Choose **OpenAI-compatible** at IT:

```text
Base URL: http://127.0.0.1:11434/v1
API key: optional for local runtimes
Known model ID: model installed in your runtime
Custom headers: optional JSON object
```

`/models` and streaming `/chat/completions` are used through the official OpenAI SDK. For servers without `/models`, enter the known model manually: testing may fail while chat works. That failure stays visible. No fake successful connection state is substituted.

Compatible services can include Ollama, LM Studio, OpenRouter or custom servers, subject to their endpoint/model support. Anthropic/Gemini native protocols and MCP are not separate adapters in this version.

## Offline and explicit demo

Offline hiring/walking/appearance/gameplay all work. AI requests fail explicitly with **NO AGENT PROVIDER CONNECTED** until a real adapter is configured.

To test animation without credentials:

```dotenv
ENABLE_DEMO_PROVIDER=true
```

Restart backend. Add **DEMO SIMULATION** at IT, test and assign `demo-simulation` to an employee. Every generated reply/report labels itself as simulation. This is disabled by default and used only by the isolated E2E test fixture.

## Context, usage and timeouts

Recent conversation context is bounded by message count/character budget, plus employee instructions and up to three recent reports. Old conversations remain stored but are not blindly sent to OpenAI. OpenCode also retains its session's native context.

Requests have a five-minute engine timeout. OpenAI HTTP calls have a two-minute SDK timeout and one retry. Errors/partial text persist. Token/cost fields exist only when providers return them; finance never invents price estimates. Meeting tokens are currently outside task/chat analytics.
