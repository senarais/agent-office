# Telegram reports and the Social Media division

Two connected features:

1. Completed reports can be delivered to Telegram, including a per-schedule toggle for recurring reports.
2. A **Social Media** division runs a reviewable pipeline: Research → Creative options → your approval → local Playwright browser publishing → analytics.

No external workflow, webhook bridge or automation service is used. The office drives a real Chromium browser through Playwright.

## Requirements

```bash
npx playwright install chromium
```

The server keeps persistent browser profiles under `DATA_DIR/browser/<platform>`. Log in once per account in a headed window; cookies and local storage are reused afterwards.

Optional `.env` (backend only):

```dotenv
# false is more reliable for X/Instagram UI automation; true runs without a visible window.
SOCIAL_BROWSER_HEADLESS=false

# Optional Chrome/Chromium path. Empty uses Playwright's bundled browser.
SOCIAL_BROWSER_EXECUTABLE=
SOCIAL_BROWSER_TIMEOUT_MS=60000

# Optional image generation for post media. Uses OPENAI_API_KEY above.
OPENAI_IMAGE_MODEL=

# Telegram report delivery and remote approvals.
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Restart `npm run dev` after changing `.env`.

## Connect an account

1. Open **Boss laptop → Social media → Connections**.
2. Enable X and/or Instagram and enter the handle.
3. Press **Save handles & platform toggles**.
4. Press **Open login browser**. A Chromium window opens at the platform login page.
5. Log in manually, complete 2FA/CAPTCHA if asked, then close the window.
6. Press **Check session** to confirm the persistent profile is authenticated.
7. Press **Sync analytics** to load the account and recent posts.

Only X and Instagram are currently implemented for browser publishing and analytics. Other platforms return an explicit “not implemented” error; the office never fakes a successful post.

### If “Continue with Google” is blocked

Google refuses OAuth sign-in in browsers it identifies as automated. The in-game login window is Playwright-controlled, so Google may show “This browser or app may not be secure.”

Options:

1. **Simplest:** sign in to X with your username/email and password instead of Google.
2. **If the account requires Google:** sign in using a normal Google Chrome launch on the same dedicated profile, then let the office reuse it:

```bash
cd /path/to/senaoffice
google-chrome \
  --no-sandbox \
  --disable-dev-shm-usage \
  --user-data-dir="$PWD/.local-data/browser/x" \
  --profile-directory=Default \
  https://x.com/i/flow/login
```

`--no-sandbox` is needed on Ubuntu 23.10+ / distributions where AppArmor restricts unprivileged user namespaces. Use it only for this dedicated profile.

Log in with Google in that window, close Chrome, then set:

```dotenv
SOCIAL_BROWSER_EXECUTABLE=/usr/bin/google-chrome
SOCIAL_BROWSER_HEADLESS=false
```

Restart the server and press **Check session**. Make sure no other Chrome window is using that dedicated `user-data-dir` while the office is posting.

### If X temporarily limits login

X may answer repeated automated logins with **“We’ve temporarily limited your login. Please try again later.”** Stop retrying; each attempt can extend the limit.

If you are already logged in to X in your normal browser, reuse that session instead:

1. Install **Cookie-Editor** (or a similar cookie exporter) in the browser where X is logged in.
2. Open `x.com`, export the cookies as **JSON**, and save them as `cookies.json` in the project directory.
3. With the office server running:
   ```bash
   node scripts/import-social-cookies.mjs x cookies.json
   ```
   The script fetches the local session token and imports only the cookie fields into the dedicated Playwright profile.
4. Delete `cookies.json` immediately.
5. Office → **Check session**.

The cookie file contains live session credentials. Use only your own account, never commit or share the file, and expect the session to expire eventually. X may still detect browser automation after a valid session is imported.

## Publishing flow

1. Run research normally, or open a report and choose **Create social campaign**.
2. In **Social media → New campaign**, choose the platform, brief, Creative owner, Social Media owner, optional research report, and expected option count.
3. Creative returns structured options (headline, caption, hashtags, image/video prompt). If `OPENAI_IMAGE_MODEL` is configured, images are generated. Otherwise X can still publish text; Instagram requires media.
4. Review in **Pipeline** or Telegram. Approve one option or request a revision with feedback.
5. On approval the Playwright worker:
   - **X:** opens the composer, types the caption, attaches media if present, clicks Post, and reads the resulting status URL when available.
   - **Instagram:** opens Create, uploads the image/video, advances the dialog, fills the caption, clicks Share, and reads the profile’s latest post URL when available.
6. The real result (`externalId`, URL, timestamp) is stored on the campaign. A rejected post or a UI challenge is recorded as a real failure.

Telegram approval works exactly like the office: report and campaign messages include **Approve** / **Request revision** buttons and `/post`, `/approve`, `/revise` commands. The Telegram bot long-polls locally; no public URL is needed.

## Analytics

Analytics are read from the public profile while using the logged-in browser session:

- **X:** profile header (followers/following) and the latest 12 posts: text, permalink, timestamp, likes, replies, reposts/quotes and visible views.
- **Instagram:** profile metadata (followers/following/posts) and the latest 6 posts: caption, permalink, timestamp, likes and comments from the post metadata.

Metrics the page does not expose remain empty; they are never estimated. If a platform changes its DOM or shows a human-verification challenge, the sync reports the actual error and keeps the previous data.

## What you must know

- Browser automation is **best-effort UI automation**, not an official platform API. X/Instagram can change selectors, add challenges or rate-limit the account. X captions are truncated to 280 characters; Instagram captions to 2,200.
- X and Instagram often return `403` to headless browsers. `SOCIAL_BROWSER_HEADLESS=false` is the recommended default and opens a visible Chromium window while working. If headless works for your account/network and you prefer no window, set it to `true`.
- The browser profile contains live login cookies. Treat `DATA_DIR/browser/` as a secret. Use the office’s own accounts and follow each platform’s terms.
- `npx playwright install chromium` is required. If Google Chrome is installed, set `SOCIAL_BROWSER_EXECUTABLE=/usr/bin/google-chrome` to use it.
- The local server must be running for posting, analytics and Telegram approvals.
- Logging out of the account in the browser profile invalidates automation until you log in again.

## Telegram commands

| Command | Action |
| --- | --- |
| `/pending` | Reports and social reviews waiting |
| `/reports` | Recent reports |
| `/campaigns` | Recent social campaigns |
| `/approve <report-id>` | Approve a report |
| `/post <campaign-id> [option-number]` | Approve and publish with the browser |
| `/revise <id> <instructions>` | Revise a report or social campaign |
| `/status` | Browser/profile/Telegram and pending counts |

Only chat ids listed in `TELEGRAM_CHAT_ID` may approve or revise.
