import { useState } from 'react';
import { socialPlatforms } from '../../../../packages/shared/src/social';
import type { SocialBrowserSettings, SocialCampaign, SocialOption, SocialPlatform } from '../../../../packages/shared/src/social';
import { api, useGame } from '../state';
import { Empty, Field, PixelButton, PixelTabs, useAction } from './kit';

const platformName = (platform: SocialPlatform) => platform === 'x' ? 'X / TWITTER' : platform.toUpperCase();
const statusTone = (status: SocialCampaign['status']) => ['failed', 'cancelled'].includes(status) ? 'warning' : '';
const metric = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString();

function CampaignCard({ campaign }: { campaign: SocialCampaign }) {
  const world = useGame(s => s.world!); const { run, busy } = useAction(); const [revision, setRevision] = useState(''); const [confirm, setConfirm] = useState(false);
  const creative = world.employees.find(e => e.id === campaign.creativeEmployeeId);
  const social = world.employees.find(e => e.id === campaign.socialEmployeeId);
  const publish = world.socialPublishes.find(p => p.id === campaign.publishId) || world.socialPublishes.find(p => p.campaignId === campaign.id);
  const selected = campaign.options.find(option => option.id === campaign.selectedOptionId);
  const canReview = ['review', 'revision', 'failed'].includes(campaign.status);
  const approve = (option: SocialOption) => void run(async () => { await api(`/social/campaigns/${campaign.id}/approve`, { optionId: option.id }); useGame.getState().toast(`Publishing ${option.label} for ${platformName(campaign.platform)}…`); });
  const revise = () => void run(async () => { await api(`/social/campaigns/${campaign.id}/revise`, { instructions: revision }); setRevision(''); useGame.getState().toast('Creative revision requested.'); });
  return <article className="social-campaign">
    <header><div className="grow"><span className="eyebrow">{platformName(campaign.platform)} · {new Date(campaign.createdAt).toLocaleString()}</span><h3>{campaign.title} <span className={`tag ${statusTone(campaign.status)}`}>{campaign.status.toUpperCase()}</span></h3><p>{campaign.brief}</p></div><div className="row-actions"><PixelButton onClick={() => useGame.getState().open('chat', campaign.creativeEmployeeId)}>Creative: {creative?.name || 'missing'}</PixelButton><PixelButton onClick={() => useGame.getState().open('chat', campaign.socialEmployeeId)}>Social: {social?.name || 'missing'}</PixelButton></div></header>
    {campaign.researchReportId && <PixelButton onClick={() => useGame.getState().open('report', campaign.researchReportId)}>Open research source</PixelButton>}
    {campaign.error && <p className="inline-error">{campaign.error}</p>}
    <div className="social-options">{campaign.options.map(option => <section className={`social-option ${campaign.selectedOptionId === option.id ? 'selected' : ''}`} key={option.id}>
      <div className="social-option-head"><b>{option.label}</b><span className="tag">{option.mediaType}{option.status !== 'proposed' ? ` · ${option.status}` : ''}</span></div>
      {option.headline && <h4>{option.headline}</h4>}
      {option.mediaUrl && (option.mediaType === 'video' ? <video className="social-option-media" src={option.mediaUrl} controls muted loop /> : <img className="social-option-media" src={option.mediaUrl} alt={option.headline || option.label} loading="lazy" />)}
      {option.mediaError && <p className="inline-error">{option.mediaError}</p>}
      <p className="social-caption">{option.caption}</p>
      {!!option.hashtags.length && <small>{option.hashtags.join(' ')}</small>}
      {option.script && <details><summary>Video script</summary><pre className="document">{option.script}</pre></details>}
      {option.imagePrompt && <details><summary>Image prompt</summary><p>{option.imagePrompt}</p></details>}
      {canReview && <PixelButton className="primary" disabled={busy} onClick={() => approve(option)}>Approve & post {option.label}</PixelButton>}
      {campaign.selectedOptionId === option.id && campaign.status === 'published' && <span className="tag">PUBLISHED</span>}
    </section>)}</div>
    {canReview && <form onSubmit={event => { event.preventDefault(); revise(); }}><Field label="Ask Creative for a revision" hint="The creative agent receives the previous options plus your feedback, then returns new options."><textarea rows={2} maxLength={10000} value={revision} onChange={event => setRevision(event.target.value)} placeholder="Make the hook sharper, use a warmer tone, and keep the image more editorial." /></Field><div className="form-actions"><PixelButton disabled={busy || !revision.trim()}>Request revision</PixelButton><PixelButton type="button" className="danger" onClick={() => setConfirm(true)}>Cancel campaign</PixelButton></div></form>}
    {confirm && <div className="inline-confirm"><p>Cancel “{campaign.title}”? Active creative work will be cancelled.</p><PixelButton className="danger" disabled={busy} onClick={() => void run(async () => { await api(`/social/campaigns/${campaign.id}/cancel`, {}); setConfirm(false); })}>Confirm cancel</PixelButton><PixelButton onClick={() => setConfirm(false)}>Keep campaign</PixelButton></div>}
    {publish && <div className="social-publish-line"><span className={`status-lamp ${publish.status === 'published' ? 'online' : ''}`} /><div className="grow"><b>{publish.status.toUpperCase()}</b><small>{publish.publishedAt ? new Date(publish.publishedAt).toLocaleString() : `Attempt ${publish.attempts}`}{publish.error ? ` · ${publish.error}` : ''}</small></div>{publish.url && <a href={publish.url} target="_blank" rel="noreferrer">Open post ↗</a>}</div>}
    {selected && campaign.status === 'published' && <p className="note">Approved option: {selected.label} · {selected.headline || 'published post'}</p>}
  </article>;
}

function CampaignCreator({ reportId }: { reportId?: string }) {
  const world = useGame(s => s.world!); const { run, busy } = useAction(); const report = world.reports.find(r => r.id === reportId);
  const creative = world.employees.filter(e => e.employmentStatus === 'active' && e.department === 'Creative');
  const social = world.employees.filter(e => e.employmentStatus === 'active' && e.department === 'Social Media');
  const [form, setForm] = useState({ title: report?.title || '', brief: report?.text.slice(0, 2000) || '', platform: 'x' as SocialPlatform, creativeEmployeeId: creative[0]?.id || '', socialEmployeeId: social[0]?.id || '', researchReportId: report?.id || '', expectedOptions: 3 });
  const set = (key: keyof typeof form, value: unknown) => setForm(current => ({ ...current, [key]: value }));
  const reports = [...world.reports].reverse();
  return <form onSubmit={event => { event.preventDefault(); void run(async () => { await api('/social/campaigns', form); setForm(current => ({ ...current, title: '', brief: '', researchReportId: '' })); useGame.getState().toast('Campaign sent to Creative. Options will return for review.'); }); }}>
    <span className="eyebrow">CREATIVE → SOCIAL MEDIA PIPELINE</span><h2>From research to a reviewable post.</h2>
    <p>Creative produces real caption/image/video options. You review them here or in Telegram. Approved work is posted by the local Playwright browser worker using the account session you logged in once.</p>
    {(!creative.length || !social.length) && <p className="note">This pipeline needs at least one active Creative employee and one active Social Media employee. Hire both in HR. Nothing is simulated when they are missing.</p>}
    <div className="form-grid"><Field label="Campaign title"><input required maxLength={140} value={form.title} onChange={event => set('title', event.target.value)} /></Field><Field label="Platform" hint="Browser automation currently supports X and Instagram."><select value={form.platform} onChange={event => set('platform', event.target.value)}>{socialPlatforms.filter(platform => ['x', 'instagram'].includes(platform)).map(platform => <option key={platform} value={platform}>{platformName(platform)}</option>)}</select></Field></div>
    <Field label="Brief"><textarea required rows={5} maxLength={20000} value={form.brief} onChange={event => set('brief', event.target.value)} placeholder="What are we saying, to whom, and why now?" /></Field>
    <div className="form-grid"><Field label="Creative employee"><select required value={form.creativeEmployeeId} onChange={event => set('creativeEmployeeId', event.target.value)}><option value="">Choose Creative employee</option>{creative.map(employee => <option key={employee.id} value={employee.id}>{employee.name} · {employee.role}</option>)}</select></Field><Field label="Social Media owner"><select required value={form.socialEmployeeId} onChange={event => set('socialEmployeeId', event.target.value)}><option value="">Choose Social Media employee</option>{social.map(employee => <option key={employee.id} value={employee.id}>{employee.name} · {employee.role}</option>)}</select></Field></div>
    <div className="form-grid"><Field label="Research source (optional)"><select value={form.researchReportId} onChange={event => { const chosen = world.reports.find(r => r.id === event.target.value); setForm(current => ({ ...current, researchReportId: event.target.value, title: current.title || chosen?.title || '', brief: current.brief || chosen?.text.slice(0, 2000) || '' })); }}><option value="">No research report</option>{reports.map(r => <option key={r.id} value={r.id}>{r.title} · {new Date(r.createdAt).toLocaleDateString()}</option>)}</select></Field><Field label="Number of options"><select value={form.expectedOptions} onChange={event => set('expectedOptions', Number(event.target.value))}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>{value}</option>)}</select></Field></div>
    <div className="note">Images can be generated with <code>OPENAI_IMAGE_MODEL</code> + <code>OPENAI_API_KEY</code>. Without an image model, X can still publish text; Instagram requires media. Approved posts are published by the local Playwright browser worker.</div>
    <div className="form-actions"><PixelButton className="primary" disabled={busy || !form.creativeEmployeeId || !form.socialEmployeeId}>Send to Creative</PixelButton></div>
  </form>;
}

function SocialAnalytics() {
  const world = useGame(s => s.world!); const { run, busy } = useAction();
  return <>
    <div className="section-heading"><div><span className="eyebrow">SOCIAL MEDIA / ANALYTICS</span><h2>What the audience actually did.</h2><p>Read by the local Playwright browser worker from the public profile while logged in. Unknown metrics stay empty — never estimated.</p></div><PixelButton className="primary" disabled={busy || !world.integrations.social.browser || (!world.socialSettings.xEnabled && !world.socialSettings.instagramEnabled)} onClick={() => void run(async () => { await api('/social/analytics/sync', {}); useGame.getState().toast('Browser analytics synced.'); })}>Sync analytics</PixelButton></div>
    {!world.integrations.social.browser && <p className="note">Playwright browser not found. Run <code>npx playwright install chromium</code> on the local server.</p>}
    {world.integrations.social.browser && !world.socialSettings.xEnabled && !world.socialSettings.instagramEnabled && <p className="note">No platform enabled. Open <b>Connections</b>, add a handle, enable X or Instagram, and log in once.</p>}
    {world.socialAnalyticsError && <p className="inline-error">{world.socialAnalyticsError}</p>}
    {world.socialLastSyncAt && <p className="note">Last synced {new Date(world.socialLastSyncAt).toLocaleString()}.</p>}
    <h3>Connected accounts</h3>
    {!world.socialAccounts.length ? <Empty>No account data yet. Enable X or Instagram in Connections, log in once, then sync.</Empty> : <div className="social-accounts">{world.socialAccounts.map(account => <article key={account.id}><div className={`status-lamp ${account.connected ? 'online' : ''}`} /><div className="grow"><h3>{account.displayName} <span className="tag">{platformName(account.platform)}</span></h3><p>@{account.handle}{account.note ? ` · ${account.note}` : ''}</p><small>{account.followers === undefined ? 'Followers unavailable' : `${account.followers.toLocaleString()} followers`}{account.posts === undefined ? '' : ` · ${account.posts.toLocaleString()} posts`}</small></div></article>)}</div>}
    <h3>Latest posts</h3>
    {!world.socialPosts.length ? <Empty>No posts synced yet.</Empty> : <div className="social-posts">{world.socialPosts.slice(0, 40).map(post => <article key={post.id}><header><div><b>{post.caption.split('\n')[0].slice(0, 90) || '(no caption)'}</b><small>{platformName(post.platform)} · {new Date(post.postedAt).toLocaleString()}{post.source === 'published' ? ' · published by office' : ''}</small></div>{post.permalink && <a href={post.permalink} target="_blank" rel="noreferrer">Open ↗</a>}</header><dl className="social-metrics"><dt>Likes</dt><dd>{metric(post.likes)}</dd><dt>Comments</dt><dd>{metric(post.comments)}</dd><dt>Shares</dt><dd>{metric(post.shares)}</dd><dt>Saves</dt><dd>{metric(post.saves)}</dd><dt>Reach</dt><dd>{metric(post.reach)}</dd><dt>Impressions</dt><dd>{metric(post.impressions)}</dd><dt>Engagement</dt><dd>{post.engagementRate === undefined ? '—' : `${(post.engagementRate * 100).toFixed(2)}%`}</dd></dl></article>)}</div>}
  </>;
}

function SocialConnections() {
  const world = useGame(s => s.world!); const { run, busy } = useAction(); const status = world.integrations.social;
  const [form, setForm] = useState<SocialBrowserSettings>(world.socialSettings);
  const [session, setSession] = useState<{ x?: boolean; instagram?: boolean }>({});
  const set = (key: keyof SocialBrowserSettings, value: unknown) => setForm(current => ({ ...current, [key]: value }));
  const save = () => void run(async () => { await api('/social/settings', form, 'PUT'); useGame.getState().toast('Browser account settings saved.'); });
  const login = (platform: 'x' | 'instagram') => void run(async () => { const result = await api<{ alreadyOpen: boolean }>('/social/browser/login', { platform }); useGame.getState().toast(result.alreadyOpen ? 'Login window is already open.' : 'Login window opened. Log in, then close the window.'); });
  const check = (platform: 'x' | 'instagram') => void run(async () => { const result = await api<{ loggedIn: boolean }>('/social/browser/check', { platform }); setSession(current => ({ ...current, [platform]: result.loggedIn })); useGame.getState().toast(result.loggedIn ? `${platformName(platform)} session is active.` : `${platformName(platform)} is not logged in. Open the login browser.`); });
  return <>
    <span className="eyebrow">SOCIAL MEDIA / BROWSER CONNECTIONS</span><h2>Log in once. The office clicks the rest.</h2>
    <p>Approved posts are published by a local Playwright browser using persistent profiles. The office never stores your password; cookies live under <code>DATA_DIR/browser/</code>.</p>
    <div className="integration-grid">
      <article><div className={`status-lamp ${status.browser ? 'online' : ''}`} /><h3>Playwright browser</h3><p>{status.browser ? `Available · ${status.headless ? 'headless' : 'headed'}` : 'Not found'}</p><small>{status.browser ? 'Chromium can drive X and Instagram.' : 'Run npx playwright install chromium on the local server.'}</small></article>
      <article><div className={`status-lamp ${world.integrations.telegram.configured ? 'online' : ''}`} /><h3>Telegram reports & approvals</h3><p>{world.integrations.telegram.configured ? `Connected · ${world.integrations.telegram.chats} chat destination(s)` : 'Not configured'}</p><PixelButton disabled={busy || !world.integrations.telegram.configured} onClick={() => void run(() => api('/telegram/test', {}))}>Send test message</PixelButton></article>
      <article><div className={`status-lamp ${status.media ? 'online' : ''}`} /><h3>Image generation</h3><p>{status.media ? 'OpenAI Images configured' : 'Not configured'}</p><small>Set OPENAI_IMAGE_MODEL + OPENAI_API_KEY for generated post images.</small></article>
    </div>
    <h3>X / Twitter</h3>
    <div className="browser-account">
      <label className="check"><input type="checkbox" checked={form.xEnabled} onChange={event => set('xEnabled', event.target.checked)} /> Enable X analytics</label>
      <Field label="X handle"><input value={form.xHandle} maxLength={120} onChange={event => set('xHandle', event.target.value)} placeholder="abisena" /></Field>
      <div className="browser-actions"><div className={`status-lamp ${session.x === true || status.profiles.x ? 'online' : ''}`} /><small>{session.x === true ? 'Session active' : session.x === false ? 'Not logged in' : status.profiles.x ? 'Profile directory exists · use Check session' : 'No browser profile yet'}</small><PixelButton disabled={busy || !status.browser} onClick={() => login('x')}>Open login browser</PixelButton><PixelButton disabled={busy || !status.browser} onClick={() => check('x')}>Check session</PixelButton></div>
    </div>
    <h3>Instagram</h3>
    <div className="browser-account">
      <label className="check"><input type="checkbox" checked={form.instagramEnabled} onChange={event => set('instagramEnabled', event.target.checked)} /> Enable Instagram analytics</label>
      <Field label="Instagram handle"><input value={form.instagramHandle} maxLength={120} onChange={event => set('instagramHandle', event.target.value)} placeholder="abisena" /></Field>
      <div className="browser-actions"><div className={`status-lamp ${session.instagram === true || status.profiles.instagram ? 'online' : ''}`} /><small>{session.instagram === true ? 'Session active' : session.instagram === false ? 'Not logged in' : status.profiles.instagram ? 'Profile directory exists · use Check session' : 'No browser profile yet'}</small><PixelButton disabled={busy || !status.browser} onClick={() => login('instagram')}>Open login browser</PixelButton><PixelButton disabled={busy || !status.browser} onClick={() => check('instagram')}>Check session</PixelButton></div>
    </div>
    <div className="form-actions"><PixelButton className="primary" disabled={busy} onClick={save}>Save handles & platform toggles</PixelButton></div>
    <p className="note"><b>Login flow:</b> click Open login browser, log in manually in the browser window that appears, then close the window. Posting and analytics then run <b>{status.headless ? 'headless' : 'headed'}</b> according to <code>SOCIAL_BROWSER_HEADLESS</code>. If X/Instagram shows a challenge, set it to <code>false</code>, restart the server, and retry so you can see the browser.</p>
    <pre className="document">{`# optional browser settings
SOCIAL_BROWSER_HEADLESS=false
SOCIAL_BROWSER_EXECUTABLE=/usr/bin/google-chrome
SOCIAL_BROWSER_TIMEOUT_MS=60000

# optional image generation
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_API_KEY=`}</pre>
    <p className="note">Browser automation is best-effort: X and Instagram can change their UI or show human-verification challenges. Failures are reported honestly; the office never marks a post as published without a real browser result. Only the accounts you log in yourself are used.</p>
    <h3>Telegram commands</h3>
    <dl className="metrics"><dt>/pending</dt><dd>Reports and social reviews waiting</dd><dt>/reports</dt><dd>Recent reports</dd><dt>/campaigns</dt><dd>Social campaign status</dd><dt>/approve &lt;report-id&gt;</dt><dd>Approve a report</dd><dt>/post &lt;campaign-id&gt; [option]</dt><dd>Approve and publish</dd><dt>/revise &lt;id&gt; &lt;instructions&gt;</dt><dd>Request report or creative changes</dd><dt>/status</dt><dd>Integration and pending counts</dd></dl>
    <p className="note">The Telegram bot long-polls from this local server. No public webhook or tunnel is needed. Only chat ids listed in <code>TELEGRAM_CHAT_ID</code> may approve or revise.</p>
  </>;
}

export function SocialMedia({ reportId }: { reportId?: string }) {
  const world = useGame(s => s.world!); const [tab, setTab] = useState('Pipeline');
  const campaigns = [...world.socialCampaigns].reverse();
  return <>
    <div className="section-heading"><div><span className="eyebrow">SOCIAL MEDIA / STUDIO</span><h2>Research → Creative → Your call.</h2><p>Review real options, request revisions, and let the approved post publish automatically. Telegram can do all of it.</p></div><div className="social-summary"><span className={`tag ${world.integrations.telegram.configured ? '' : 'warning'}`}>TELEGRAM {world.integrations.telegram.configured ? 'ON' : 'OFF'}</span><span className={`tag ${world.integrations.social.browser ? '' : 'warning'}`}>BROWSER {world.integrations.social.browser ? 'ON' : 'OFF'}</span><span className="tag">X {world.socialSettings.xEnabled ? 'ON' : 'OFF'}</span><span className="tag">IG {world.socialSettings.instagramEnabled ? 'ON' : 'OFF'}</span><span className="tag">{campaigns.filter(c => c.status === 'review').length} TO REVIEW</span></div></div>
    <PixelTabs values={['Pipeline', 'New campaign', 'Analytics', 'Connections']} current={tab} onChange={setTab} />
    {tab === 'Pipeline' && (!campaigns.length ? <Empty>No campaigns yet. Start from a research report, or compose a brief in New campaign.</Empty> : campaigns.map(campaign => <CampaignCard key={campaign.id} campaign={campaign} />))}
    {tab === 'New campaign' && <CampaignCreator reportId={reportId} />}
    {tab === 'Analytics' && <SocialAnalytics />}
    {tab === 'Connections' && <SocialConnections />}
  </>;
}
