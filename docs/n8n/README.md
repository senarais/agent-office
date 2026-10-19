# Ready-made n8n workflows

Two workflows were imported into the local n8n instance and are already **active**:

| Workflow | Webhook |
| --- | --- |
| Abisena Social Publish | `http://127.0.0.1:5678/webhook/abisena-social` |
| Abisena Social Analytics | `http://127.0.0.1:5678/webhook/abisena-analytics` |

The office `.env` is already configured with those URLs and the shared secret. n8n also has a **Header Auth** credential named `Abisena Social Webhook Secret`; the webhooks reject requests without the matching `X-Social-Secret` header.

The exported JSON files in this directory are backups. Importing them into a different n8n instance requires re-selecting credentials.

## What is already wired

- **Publish:** X, Instagram, Facebook branches.
- **Analytics:** X and Instagram branches, combined into the payload the office expects.
- **Errors:** unsupported actions/platforms and missing media return JSON errors with HTTP 400.
- **Secret verification:** handled by n8n Header Auth, not a Code node.

## Remaining one-time steps (must be done in the n8n UI)

### 1. X / Twitter

1. n8n → **Credentials → New → X OAuth2 API**.
2. Fill the client ID/secret from your X Developer App and click **Connect**.
3. Open these nodes and select the credential:
   - Publish workflow: **X: Post**
   - Analytics workflow: **X: Me**, **X: Tweets**

X API plan must allow writing and reading tweets. If your plan does not, the workflow returns the real API error and the office marks publishing/sync as failed.

### 2. Instagram / Facebook

A **Query Auth** credential named `Meta Access Token` already exists. The IG/FB nodes already reference it.

1. n8n → **Credentials → Meta Access Token**.
2. Set **Value** to a long-lived Meta access token.
3. Open the **Config** node in each workflow and fill:
   - Publish: `instagramUserId`, optionally `facebookPageId`.
   - Analytics: `instagramUserId` (and set `xEnabled` to `true` if you connected X).

Instagram publishing needs an Instagram Business/Creator account linked to a Facebook Page and the `instagram_content_publish` permission. Instagram requires a **public HTTPS image URL**; a local `/api/media/...` URL will not work with Meta.

### 3. Media generation (optional)

The publish workflow returns a clear error for `generate_media`. Choose one:

- Set `OPENAI_IMAGE_MODEL` + `OPENAI_API_KEY` in the office `.env` (direct image generation), or
- Add your own image/video node to the publish workflow, or
- Point `MEDIA_WEBHOOK_URL` at a separate media workflow.

## Test without posting

These should return `200` / a controlled `400`, not an auth failure:

```bash
SECRET="$(grep '^SOCIAL_WEBHOOK_SECRET=' .env | cut -d= -f2-)"

curl -X POST http://127.0.0.1:5678/webhook/abisena-analytics \
  -H "X-Social-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"action":"analytics"}'
# -> {"accounts":[],"posts":[]} until a platform is enabled/configured

curl -X POST http://127.0.0.1:5678/webhook/abisena-social \
  -H "X-Social-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"action":"ping"}'
# -> 400 {"error":"Unsupported action…"} proves auth + routing work
```

After filling the Config node and credentials, approve a real campaign in the office. n8n returns the real `externalId`/`url`, which the office stores on the campaign.

## Notes

- n8n must stay running for publishing and analytics.
- The office server must be restarted after `.env` changes.
- Do not commit `.env` or n8n credentials.
- The webhook secret is stored in n8n's encrypted credential store and in the local `.env`.
