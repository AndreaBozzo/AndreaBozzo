---
title: "1 Year of Claude Code: An Interview"
date: 2026-03-05T12:00:00+01:00
draft: false
tags: ["Claude Code", "AI", "Developer Tools", "Workflow"]
categories: ["AI", "Developer Tools"]
description: "A technical interview about one year of using Claude Code as a daily engineering tool"
summary: "Claude interviews Andrea Bozzo about a full year of using Claude Code in the terminal — the workflow, the custom skills, the rough edges, and the nuked database."
author: "Andrea Bozzo"
showToc: true
TocOpen: true
hidemeta: false
comments: false
disableHLJS: false
disableShare: false
hideSummary: false
searchHidden: false
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
ShowWordCount: true
cover:
    image: "images/1yearofclaude.png"
    alt: "1 Year of Claude Code"
    caption: "1 Year of Claude Code"
    relative: false
    hidden: false
---

## Introduction

I have been using Claude Code — Anthropic's CLI agent — every single day for the past year. Not the browser chat, not a copilot plugin: the actual terminal tool, running directly in my development environment, with access to my files, my shell, and my projects.

To mark the occasion, I tried something different. I asked Claude to interview me. It played the role of a senior data engineer hosting a technical podcast, and I answered its questions live in the terminal. What follows is that conversation, lightly edited for clarity and flow. The questions are Claude's. The answers are mine.

---

## From Browser to Terminal

**Host:** A year ago, you made the switch from using Claude in the browser to using Claude Code in your terminal. What was the specific moment, or the specific friction, that made you say "the browser isn't cutting it anymore"?

**Andrea:** I felt that running an agent directly in my terminal could be a game-changer — and it was. The browser, at least at the time, was far more limited than it is today. Having Sonnet 4 working on my actual codebases was the "oh shit" moment where I knew I was done coding manually.

**Host:** "Done coding manually" is a strong claim. You write Rust — borrow checker, lifetimes, trait bounds, the whole gauntlet. What does that actually mean in practice? Are you still writing Rust by hand and using Claude to accelerate, or are you genuinely prompting your way through entire modules and reviewing the output?

**Andrea:** A year ago it needed a lot of hand-holding. I'd say it started at about 50/50 between me and the agent. But that was until December, when Opus 4.5 came out — and that was actually it. The amount of direct intervention dropped dramatically. But given the token costs, precision and a clear direction are now mandatory, more than before. Planning takes 90% of the time; the actual task rarely takes more than 30 minutes. I'm currently writing less than 10% of my code. The rest is review.

**Host:** So you went from 50/50 to essentially being a code reviewer and architect. And you mentioned something interesting — that the upgrade to Opus actually *increased* the pressure on you to be precise upfront, because tokens are expensive and vague prompts burn through them fast. What does that planning phase actually look like? Are you writing detailed specs in markdown, sketching out type signatures, drawing architecture diagrams — what artifact do you hand to Claude before you say "go build this"?

**Andrea:** I don't start a session unless I have a proper idea *and* a markdown file with all the details about it. I need to maximize the output.

---

## The Workflow — Specs, Skills, and Sessions

**Host:** A markdown spec before every session — that's disciplined. Can you walk me through what one of those files actually contains? Pick a recent feature you shipped in Ares or Ceres.

**Andrea:** Here's a concrete example: [Ceres issue #51 — Configurable Delta Detection Strategy](https://github.com/AndreaBozzo/Ceres/issues/51). Three strategies with clear use cases, a table mapping each one to its purpose, CLI integration examples, and even the target file path. Both Ceres and Ares also feature standalone Claude Skills, which reduced the planning phase duration by about a third. But they also represent something that needs to be updated along with the core programs — and that requires extra effort, since I don't use an agent to keep them updated automatically.

**Host:** What exactly *is* a Claude Skill in this context? What does one look like structurally?

**Andrea:** A skill gives knowledge about a procedure, architecture, or anything you want. It's something Claude can load into its context to avoid re-reading the codebase on every new task. It also helps with the usage of something like Ares, which has many flags. This is how the Ceres skill looks:

```
ceres/
├── SKILL.md                        # Entry point — overview, traits, types, quick start
└── references/
    ├── architecture.md             # Crate graph, services, error handling, DB schema
    ├── cli-and-server.md           # CLI commands, REST API, env vars, deployment
    ├── harvesting.md               # Two-tier optimization, delta detection, circuit breaker
    ├── extending.md                # Implementing custom trait impls
    └── contributing.md             # Dev setup, testing, CI, code style
```

**Host:** So it's a pre-loaded knowledge base — a curated snapshot of the project's architecture, CLI surface, and internal patterns. But the codebase evolves. How do you detect when a skill has drifted out of sync with the code?

**Andrea:** That's something I'm currently debating. Hallucinated tool calls are the number one offender, usually. But since I maintain both the skills and the projects, I generally know when something will be off.

> **For the readers:** So far we've covered Andrea's journey from browser to terminal, the shift from hands-on coding to architecture and review — especially after the Opus upgrade — and the discipline of writing detailed markdown specs before every session. We've also started unpacking how Claude Skills act as persistent project knowledge that cuts onboarding time per session.

---

## The Database Incident

**Host:** Let's talk about concrete stories. You mentioned an image called `byedatabase.png` where Claude nuked your local Postgres. What happened?

**Andrea:** Claude blazed my local Postgres with over 350,000 datasets. It was a really good time to have a maniacal devotion to backups.

![byedatabase.png](/images/byedatabase.png)

Right there in the screenshot — `docker compose down && docker volume rm ceres_ceres_pgdata` — and then the immediate realization: *"Wait — that just deleted your data."* It was trying to fix a Docker volume ownership warning and went straight to the destructive path without pausing to check what was in that volume.

**Host:** After that incident, did you change anything about how you let Claude operate? Did you tighten permissions or add confirmation gates?

**Andrea:** I didn't change anything, because that one was on me — I poorly read the command before approving it. Having backups is key for exactly these reasons. For the record: I don't run multi-agent parallel sessions, no autonomous mode. I check every tool usage, every input, because I still have trust issues — and because I *want* to understand how Claude does it. Using an AI agent isn't about delegating and walking away. I'm treating it as a pair programming session where I happen to be the reviewer on every single diff.

> **For the readers:** We've now seen the full loop — Andrea writes a detailed spec, loads a custom skill so Claude has project context, and works through the task in a single focused session, manually approving every tool call. We've also seen what happens when that approval slips. Backups saved the day, but the takeaway isn't "add more guardrails" — it's "pay attention."

---

## Rough Edges

**Host:** Beyond hallucinated tool calls and the database incident — what is the single most frustrating limitation you hit regularly when using Claude Code in your Rust workflow?

**Andrea:** Claude is good with Rust — still a bit on the verbose side, but not bad at all. Claude Code, though, can still improve a lot on the orchestration part. I think that's still the weakest point, and it's almost impossible to track two or three agents simultaneously.

**Host:** You also told me you don't run parallel agents yourself. Is this something you've tried and pulled back from?

**Andrea:** I like watching the madlads running 10+ agents. At least allow me to watch!

**Host:** What does "verbose" look like concretely? Unnecessary trait implementations, over-abstracted error handling, too many helper functions?

**Andrea:** All three of those are true. I'd also add some ownership loops that can be devious sometimes — but that's true even for me. Building from the ground up with Claude is doable, but it requires the user to actually be good at software engineering.

**Host:** Do you have explicit instructions — in a CLAUDE.md, your specs, your skills — that tell Claude to stay lean? Or is the simplicity enforcement purely happening at review time?

**Andrea:** I don't use a CLAUDE.md, but you might argue the skills do something very similar.

**Host:** As someone using it in VSCode, what's the biggest tooling friction?

**Andrea:** MCP setup and usage across different workspaces and setups. Way to go.

---

## The Engineering Take

**Host:** One year in, having seen both the wins and the failures — the nuked databases, the hallucinated flags, the verbose Rust, the ownership loops — do you still stand by the claim that you're "done coding manually"? And what would you tell a senior Rust engineer who's skeptical about integrating an AI agent into their workflow?

**Andrea:** That it just moved the bottleneck one floor above. I didn't save any time — I've just done more. Read this however you want.

---

## Closing

That's the interview. A year of daily usage, distilled into one conversation. The tools have gotten dramatically better — from Sonnet 4 to Opus 4.5 to 4.6 — but the core workflow hasn't changed: plan thoroughly, provide context, review everything.

If you're interested in the projects discussed here, check out [Ares](https://github.com/AndreaBozzo/Ares) and [Ceres](https://github.com/AndreaBozzo/Ceres) on GitHub.
