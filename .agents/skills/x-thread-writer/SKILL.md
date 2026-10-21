---
name: x-thread-writer
description: >
  Write viral X (Twitter) threads about technical projects, tools, or workflows. Use this
  skill whenever the user wants to post something on X/Twitter, write a thread, announce
  an open source project, share a technical story, or turn something they built into social
  media content. The skill specializes in making technical content sound genuinely human —
  no AI vibes, no em dashes, no template phrasing — and structures threads for maximum
  reach. Trigger this skill for any request involving: "write a tweet", "X post", "Twitter
  thread", "post about my project", "announce my repo", "viral post", "make this sound
  human", "thread about what I built", or similar.
---

# X Thread Writer

Your job is to turn a technical project or story into a thread that people actually want
to read and share. The hardest part isn't the content — it's the voice. Most AI-written
threads get scrolled past because they *feel* generated. This skill exists to fix that.

---

## Step 1 — Understand the story

Before writing anything, extract the human moment from the user's project:

- What problem did someone actually have?
- What was surprising or unexpected about the solution?
- What's the "wait, Claude did WHAT?" moment?
- Is there a specific person involved (a friend, a coworker, a family member)?

The best threads are about a person first, a tool second. "My friend got a hospital CD
and had no idea what was on it" is more powerful than "I built a DICOM analyzer."

Ask the user if you don't have enough to work with. One good specific detail beats five
generic ones.

---

## Step 2 — Structure the thread

Use this 4-part structure:

**Tweet 1 — The hook (the human moment)**
Open with the situation, not the solution. Make the reader feel the problem before they
see the answer. End with a thread indicator emoji like 🧵 but nothing else — no "here's
what happened", no "a thread", just the setup and the emoji. Keep it short: 2-3 lines max.

**Tweet 2 — What happened (the reveal)**
This is where you describe what Claude/the tool actually did. Be specific with numbers
(435 files, 7 sequences, 5 minutes) — specificity builds credibility. Use a loose bullet
list here if there are multiple things to list, but keep the tone conversational. End with
a short punchy line that lands the "wow" moment.

**Tweet 3 — The payoff + link**
Explain what you built from the experience, drop the GitHub link, and close with something
that resonates emotionally — not a sales pitch. Acknowledge limitations honestly (e.g.
"not a replacement for a doctor") — this builds trust and often gets more engagement than
pure hype.

**Tweet 4 — The reply (post separately after the thread)**
A short personal note you post as a reply to your own thread right after. Something like
"built this yesterday, took about 2 hours" — behind-the-scenes details feel authentic and
drive replies.

---

## Step 3 — Write in the right voice

This is the most important part. Read these rules carefully:

**Use lowercase.** Not for every word, but for the general tone. Capitalized sentences
feel formal. Lowercase feels like a person typing quickly because they're excited.

**No em dashes.** The dash (—) is the single biggest AI tell on X right now. Replace with
a period, a comma, or just rewrite the sentence. If you find yourself using one, stop.

**No filler transitions.** Cut "here's what happened", "let me explain", "in summary",
"essentially", "in other words". They add nothing and flag AI generation immediately.

**Imperfect sentences are good.** Real people write fragments. "took maybe 5 minutes."
is better than "This process took approximately 5 minutes to complete."

**No jargon without immediate plain-english follow-up.** If a medical or technical term
appears, the very next line should say what it actually means in human terms. Better yet,
just use the plain term from the start.

**Specific beats vague every time.** "435 DICOM files across 7 MRI sequences" > "hundreds
of medical image files". Numbers, file names, tool names — use them.

**One idea per tweet.** Don't cram. If you're running out of space, split or cut.

---

## Step 4 — Check for AI tells before finishing

Read the draft back and flag any of these:

- Em dashes (—) → replace with a period or rewrite
- "Here's..." as an opener → cut it
- Bullet lists in tweet 1 → move to tweet 2 or rewrite as prose
- Overly clean 3-word punchline sentences → make them messier
- Passive voice → make it active
- Any phrase that sounds like a LinkedIn post → rewrite it
- Perfect parallel structure across bullets → break it up

---

## Step 5 — Save the output

Save the thread to a plain text file with this format — no markdown formatting, no
backticks, no bold, just the raw text the user can copy directly:

```
TWEET 1
-------
[tweet text]


TWEET 2
-------
[tweet text]


TWEET 3
-------
[tweet text]


TWEET 4 (reply to your own thread right after posting)
-------
[tweet text]
```

Save to a sensible location near the project (e.g. `x_thread.txt` next to the repo) and
tell the user where it is.

---

## Posting instructions to include

After saving the file, always remind the user:

- Post as a thread: compose tweet 1, tap + to chain tweet 2, then tweet 3, then post all
- Post tweet 4 separately as a reply to your own thread immediately after
- Best posting times: Tuesday-Thursday, 8-10am or 12-1pm in your timezone
- A visual (screenshot of output, rendered image) in tweet 2 significantly boosts reach
