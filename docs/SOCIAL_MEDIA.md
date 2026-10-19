# Telegram reports and the Social Media division

Two connected features:

1. Completed reports can be delivered to Telegram, including a per-schedule toggle for recurring reports.
2. A new **Social Media** division runs a reviewable pipeline: Research → Creative options → your approval → automatic publishing → analytics.

Everything works locally. The office never stores social passwords. Publishing and analytics live in an automation workflow you control (n8n, Make, or any HTTP endpoint).

## What you must configure

Add these to the backend `.env` (never `VITE_*`), then restart `npm run dev`:

```dotenv
# Telegram
TELEGRAM_BOT_TOKEN=123456:bot-token-from-BotFather
TELEGRAM_CHAT_ID=123456789

# Social publishing automation
SOCIAL_WEBHOOK_URL=https://your-n8n.example/webhook/abisena-social
SOCIAL_WEBHOOK_SECRET=choose-a-long-random-string

# Optional: separate analytics endpoint. If omitted, the publish webhook
# is called again with {"action":"analytics"}.
SOCIAL_ANALYTICS_URL=

# Optional: image/video generation endpoint.
MEDIA_WEBHOOK_URL=
MEDIA_WEBHOOK_SECRET=

# Optional: direct OpenAI image generation fallback (images only).
OPENAI_IMAGE_MODEL=gpt-image-1
# OPENAI_API_KEY is already used for the OpenAI agent provider above.
```

`TELEGRAM_CHAT_ID` may contain several comma-separated ids (for example a personal chat and a group). Only those chats may approve or request revisions.

If `SOCIAL_WEBHOOK_URL` is absent, the pipeline still creates options and accepts approvals, but publishing fails honestly with **No publishing connector**. Nothing is marked as posted without a real result.

## Ready-made n8n workflows

This repository includes two importable workflows under [`docs/n8n/`](n8n/):

- **Abisena Social Publish** → `/webhook/abisena-social` (X, Instagram, Facebook)
- **Abisena Social Analytics** → `/webhook/abisena-analytics` (X and Instagram metrics)

They use n8n Header Auth with `X-Social-Secret` and a Config node for account IDs. The one-time platform credential steps are in [docs/n8n/README.md](n8n/README.md).

## Telegram setup

1. Message **@BotFather**, create a bot, copy the token.
2. Send any message to your new bot.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy the chat id from the result.
4. Put both values in `.env`, restart the server.
5. Open **Boss laptop → Social media → Connections → Send test message**.

The bot long-polls Telegram from the local server, so no public URL or tunnel is required. The server must stay running.

### Report delivery

- **Per recurring schedule:** edit a recurring task and enable **Send report to Telegram**.
- **Manual/default:** **Esc → Gameplay → Send completed reports to Telegram**.
- Any report can also be sent manually from its report window.
- Report messages include **Approve** and **Request revision** buttons.
- Delivery state is stored on the report (`sent`, `failed`, or `not configured`).

### Social review by Telegram

When Creative finishes, the bot sends every option with a caption and an inline **Approve** button. Approving selects that option and publishes it immediately. **Request revision** asks for your next message, then sends that feedback back to Creative.

### Commands

| Command | Action |
| --- | --- |
| `/pending` | Reports and social reviews waiting |
| `/reports` | Recent reports |
| `/campaigns` | Recent social campaigns |
| `/approve <report-id>` | Approve a report |
| `/post <campaign-id> [option-number]` | Approve and publish an option |
| `/revise <id> <instructions>` | Revise a report or social campaign |
| `/status` | Integration and pending counts |

Ids may be shortened to their first characters. Inline buttons are usually easier.

## Social automation contract

### Publishing

The office POSTs JSON to `SOCIAL_WEBHOOK_URL`:

```json
{
  "action": "publish",
  "platform": "x",
  "caption": "Caption plus hashtags",
  "mediaUrls": ["https://cdn.example/post.png"],
  "campaignId": "…",
  "optionId": "…",
  "idempotencyKey": "campaignId:optionId",
  "approvedBy": "director"
}
```

When `SOCIAL_WEBHOOK_SECRET` is set, outgoing calls include:

```text
X-Social-Signature: sha256=<HMAC-SHA256 of the raw JSON body>
```

For a self-hosted n8n on `localhost`/`127.0.0.1`, the same secret is also sent as a plain `X-Social-Secret` header so the Webhook node can use **Header Auth** directly. That header is never added for a non-local webhook URL; remote endpoints should verify the HMAC.

Respond with a JSON object:

```json
{ "externalId": "1899…", "url": "https://x.com/…", "postedAt": "2026-10-19T10:00:00Z" }
```

If the workflow posts asynchronously, later call:

```bash
curl -X POST http://127.0.0.1:3001/api/social/callback \
  -H 'content-type: application/json' \
  -H 'x-social-secret: YOUR_SECRET' \
  -d '{"idempotencyKey":"campaignId:optionId","status":"published","url":"https://…"}'
```

`idempotencyKey` is stable per campaign option, so your workflow can deduplicate retries.

Your workflow must be able to fetch the URLs in `mediaUrls`. A hosted n8n instance needs publicly reachable media URLs (return those from `MEDIA_WEBHOOK_URL`). Local n8n can fetch `http://127.0.0.1:3001/api/media/…` while the office server is running.

### Analytics

The office POSTs `{"action":"analytics"}` to `SOCIAL_ANALYTICS_URL` (or to `SOCIAL_WEBHOOK_URL` when the separate URL is empty) and expects:

```json
{
  "accounts": [
    { "platform": "x", "handle": "abisena", "displayName": "Abisena", "followers": 1200 }
  ],
  "posts": [
    {
      "platform": "x", "externalId": "123", "caption": "…",
      "postedAt": "2026-10-19T09:00:00Z", "permalink": "https://…",
      "likes": 42, "comments": 7, "shares": 3, "saves": 1,
      "impressions": 9000, "reach": 7000, "clicks": 120
    }
  ]
}
```

Push the same payload to `POST /api/social/analytics` with header `x-social-secret`. Missing metrics stay unavailable; the office never estimates them.

### Media generation

The office POSTs:

```json
{ "action": "generate_media", "type": "image", "prompt": "…", "campaignId": "…", "label": "Option A" }
```

Respond with `{"url":"https://…"}` (optionally `thumbnailUrl`, `note`). Use a public HTTPS URL if you want Telegram to show a photo preview. Local `/api/media/…` URLs render inside the office.

If no media webhook exists and `OPENAI_IMAGE_MODEL` + `OPENAI_API_KEY` are set, images are generated directly and saved under `DATA_DIR/media`. Video generation needs the webhook.

## In-game flow

1. Hire at least one **Creative** employee and one **Social Media** employee in HR. Both need a working agent provider/model for real output.
2. Run research normally, or open any report and choose **Create social campaign**.
3. In **Boss laptop → Social media → New campaign**, choose platform, brief, Creative owner, Social Media owner, optional research report, and number of options.
4. Creative returns structured options (headline, caption, hashtags, image/video prompt). Media is generated when configured.
5. Review in **Pipeline** or Telegram. Approve one option, or request a revision with feedback.
6. Approved work is published through `SOCIAL_WEBHOOK_URL`; the result and URL are stored on the campaign.
7. **Analytics** shows synced accounts, latest posts, likes, comments, shares, saves, reach, impressions, clicks and engagement rate.

## Honest limits

- No platform OAuth is implemented inside the office. Platform credentials stay in your automation workflow.
- Publishing requires the local server, the configured webhook and the automation workflow to be running.
- Creative output is parsed as JSON. If an agent returns prose, the full response becomes one reviewable text option instead of being silently discarded.
- Media generation is only as good as the configured image/video service.
- Telegram photo/video previews require publicly reachable HTTPS URLs.
- This remains a trusted single-user local application, not a multi-tenant hosted service.
