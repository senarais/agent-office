# Workflows: multi-agent flows with a daily schedule

A workflow is a reusable flow of real agent tasks. Social media is one preset, not the only flow. A workflow can pass research to another agent, pause for your approval, request a revision, and schedule real social posts for later.

Open **Boss laptop → Workflows**. The same app is linked from **Social media → Open recurring workflows**.

## What a workflow contains

- **Definition:** name, description, timezone, optional schedule, enabled/paused state.
- **Steps:** each step is assigned to one active employee and has instructions, an expected output, optional tools, dependencies and an approval gate.
- **Dependencies:** a step starts only after every step it depends on is approved/completed. Cycles and unknown dependencies are rejected when the definition is saved.
- **Approval gate:** `Pause for my approval after this step`. The workflow stops, the report is sent to Telegram, and you can approve or request a revision from the office or Telegram.
- **Run snapshot:** every run copies the step definitions. Editing a flow never rewrites work already in flight.

## Presets

The editor can load:

1. **Daily social media posting** — Research → Social Media schedule. Creative is optional; text-only posts are valid. The Social Media step is a `social-plan` step and requires approval.
2. **Research → new program** — Research → program proposal → implementation plan (approval on the final plan).

Presets leave employees unassigned. Pick a real employee for every step before saving.

## Daily / recurring schedule

Enable **Run on a schedule** in the editor and choose daily, weekly, interval, cron or one-time. The schedule uses the same timezone/DST and `cron-parser` implementation as recurring tasks.

- One active run per workflow. A due occurrence while a run is still waiting for approval is skipped rather than started twice.
- After downtime, one overdue occurrence catches up; later missed slots are coalesced.
- The local server and provider must be running. Nothing is simulated while the computer is off.
- Pausing a definition stops future runs; it does not cancel an active run. Use **Cancel run** in the run card.

## Approval and revision

When an approval step finishes:

1. The employee's real report is stored in the normal report tray.
2. The workflow moves to **waiting approval**.
3. The report is sent to Telegram with **Approve** and **Request revision** buttons. The report tray also works.
4. **Approve & continue** unlocks dependent steps.
5. **Request revision** returns the previous output and your feedback to the same agent. The agent produces a new report, which comes back for approval. Revision history and count are stored on the step.

Telegram commands: `/pending`, `/workflows`, `/approve <report-id>`, `/revise <report-id> <instructions>`, `/status`.

Telegram delivery for workflow steps is mandatory. If the bot is not configured, the report is marked `not-configured` honestly and the step still appears in the office.

## Social posting schedule

A `social-plan` step asks the assigned agent for JSON:

```json
{"posts":[
  {"time":"09:00","caption":"Morning post","hashtags":["#Abisena"],"mediaType":"text"},
  {"scheduledAt":"2026-10-20T14:00:00Z","caption":"Afternoon post","hashtags":["#Office"],"mediaType":"text"}
]}
```

- `time` is interpreted in the workflow timezone. A past time rolls to the next day, so approving a schedule does not fire a burst of late posts.
- `scheduledAt` is used as an absolute ISO timestamp when supplied.
- No prose fallback. If the agent does not return a parsable schedule, the step fails honestly and can be revised.
- On approval, the items become **approved** and the server publishes each one at its scheduled time through the existing local Playwright worker.
- Publishing results are stored as normal `SocialPost` records and appear in **Social media → Analytics**. Failures remain failed with the real error; retry or cancel them in **Social media → Schedule**.
- A post that was publishing when the server stopped is marked failed on restart so it is not silently duplicated.

Media: text posts work on X. Instagram requires media, so include `mediaUrl` or an `imagePrompt` plan; image generation is not automatic for workflow schedules. If no media is available, Instagram publishing fails honestly.

## Telegram and reports

Every workflow step produces a normal report. Workflow steps always attempt Telegram delivery, regardless of the manual-report toggle. Auto-approved intermediate steps are marked read/approved so the employee does not walk to your desk with an intermediate report; approval steps stay deliverable.

Recurring tasks now default to Telegram delivery as well. Existing definitions keep an explicit opt-out.

## Validation and failure rules

- Steps must have a unique ID, an active employee, instructions, and no self/unknown dependency or cycle.
- Social-plan steps default to platform X and five expected posts.
- Deceased/terminated/torture-room employees make a run **skipped** before any provider call.
- A provider failure marks the step failed and stops the run. Other in-flight steps are cancelled. Request a revision from the failed step or run the flow again.
- A server restart during work marks the run failed with an explicit recovery message; it never silently re-executes work. A run that was already waiting for approval survives the restart and stays actionable.
- A social-plan step's approved posts are cancelled if a later step fails the run.

## Storage

Local SQLite holds the whole save. Supabase receives additive `workflows`, `workflow_runs`, `workflow_step_runs` and `social_post_plans` tables. Apply `supabase/migrations/20261020000000_workflows.sql` after the social migration.

## Honest limits

- Workflows do not run while the local server is stopped or asleep.
- A workflow run is not a provider-native suspended computation. Approval and revision are durable local state; revision starts a new provider turn.
- Browser publishing remains best-effort UI automation. Only a real browser result is marked published.
- Cost/token reporting is whatever the provider returned; missing values stay unavailable.
