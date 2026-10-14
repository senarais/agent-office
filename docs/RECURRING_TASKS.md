# Automated / recurring tasks

**Implemented.** Runs on the local Node server and uses the same real agent executor as manual assignments. No external cron service or extra `.env` setting is required.

## Set up a daily job

1. Connect a provider at **IT / Agent Network** and assign the employee a working model in HR.
2. Walk to the **boss laptop → Recurring tasks**. The same app is available from employee dialogue, HR and the whiteboard.
3. Choose **New recurring task**.
4. Enter name, employee and actual task instructions.
5. Select schedule, timezone, provider/model and optional OpenCode tools/project path.
6. Choose **printer / laptop / both**, whether to notify, whether the employee should physically deliver a report, and optional failure retry.
7. Save. The next execution time appears in the selected timezone.

Example:

```text
Name: Morning competitor briefing
Employee: Nisa
Schedule: Daily, 09:00
Timezone: Asia/Jakarta
Instructions: Summarize the supplied competitor data and flag material changes.
Output: Printer + laptop
Notify: On
Employee delivers report: On
```

If the task needs actual web browsing, filesystem reads, or commands, use OpenCode with the relevant tools enabled. OpenAI/compatible text-only connections cannot actually scrape a site or read files. Provider access still requires real credentials/runtime setup.

## Supported schedules

| Type | Behavior |
| --- | --- |
| One-time | Absolute timestamp; editor uses browser-local time and stores UTC |
| Daily | Time of day in an IANA timezone |
| Weekly | Selected weekdays and local time; supports weekdays-only jobs |
| Interval | Every N minutes, minimum 1; phase anchored to creation time |
| Cron | Five fields: minute, hour, day-of-month, month, weekday |

Cron examples:

```text
0 9 * * *       Every day at 09:00
30 8 * * *      Every day at 08:30
0 10 * * 1-5    Weekdays at 10:00
0 */2 * * *     Every two hours
0 18 * * *      Daily at 18:00
```

Calendar calculations use `cron-parser` 5.10.1 with timezone/DST handling. Intervals are elapsed-time schedules. Definition capacity: 100 per local company.

## What happens at the scheduled time

The server claims the occurrence, creates a durable task, and queues the actual provider request. NPC walks to their workstation before work begins. Streamed output and usage use the normal provider adapters. Completed results become normal reviewable reports.

Each `(schedule ID, scheduled timestamp)` is claimed once. Definition's next occurrence, run record and queued task are saved together. Supabase also enforces unique occurrence keys.

The browser may be closed. **The local server, computer and provider/runtime must remain available.** No work happens while the computer/server is stopped or asleep. On return, one overdue occurrence catches up and later missed slots are coalesced; no large burst of paid requests.

## Controls and run history

- **Edit:** change instructions/provider/schedule; next occurrence is recalculated.
- **Pause / Resume:** control future runs and automatic retries.
- **Run now:** additional immediate run without removing the normal next scheduled slot.
- **History / Failures:** actual run status, attempts, errors, task and generated report.
- **Delete:** stop future runs; retain a tombstone, histories and reports.
- **Tasks app:** cancel or pause an already-running request. Pausing a schedule alone does not abort it.

Reports support reading, approval, revision, archiving and creating a follow-up task. Printer-only/laptop-only routing controls printer appearance and the physical output tray; the boss's company report archive retains all results.

## Retry, availability and replacement rules

- No overlapping run for the same schedule. A still-active occurrence causes the next slot to be logged as **skipped**.
- Different schedules assigned to one employee use their serial task queue.
- Retry is optional: 0–3 retries, configurable delay of at least one minute. Error history remains attached to the occurrence.
- Intentionally paused/cancelled work is not automatically retried. Interrupted server-restart work also requires explicit retry; later normal schedule slots can run.
- Unread reports do not freeze automation. New queued work takes priority; previous reports remain in the tray.
- Deceased/fired employees have their enabled schedules paused. Resurrection resumes schedules paused specifically by death. Manually paused schedules stay paused.
- Employees in the torture room are unavailable; scheduled occurrences are logged as skipped, not performed secretly.
- **Replace similar** creates new schedule IDs from the source templates and disables/archives old definitions, retaining their run histories. Provider references are reused; raw credentials are not copied into profiles. Expired one-time templates copy as paused rather than automatically replaying old work; run them manually or edit their dates.
- **Replace completely new** does not copy schedules or provider configuration.

Scheduler records live in the local save and optional Supabase `recurring_tasks` / `scheduled_task_runs` tables. Apply both Supabase migrations when upgrading.
