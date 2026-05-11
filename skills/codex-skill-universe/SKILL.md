---
name: codex-skill-universe
description: Operate the local Codex Skill Universe dashboard. Use when the user asks to open, start, scan, refresh, verify, troubleshoot, or maintain the Codex Skill Universe web app; inspect local Codex skills; run AI Skill Doctor; configure OpenAI API key/status; save or manage Skill Groups; check /api/health, /api/skills, /api/ai/status, or /api/skill-groups; debug Vite, Node, npm, PowerShell, port, cache, privacy, or ClawHub recommendation status for this dashboard.
---

# Codex Skill Universe

## Operating Workflow

Use this skill to help the user run and maintain the local Codex Skill Universe web dashboard. The dashboard project is identified by a `package.json` whose `name` is `codex-skill-universe`.

1. Locate the dashboard project. Prefer a path provided by the user. Otherwise, search the current workspace and nearby `Documents/Codex` folders for the matching `package.json`.
2. Start or refresh the dashboard with `scripts/launch.mjs`. It runs `npm run scan`, starts the Vite dev server on `127.0.0.1`, and verifies `/api/health`.
3. Report the local URL, usually `http://127.0.0.1:5173/`, plus the skill count from `/api/skills` when available.
4. For AI Skill Doctor requests, check `/api/ai/status`. If disabled, help the user configure `OPENAI_API_KEY`; if enabled, use the page's AI Check button or `/api/ai/analyze-skill` for a user-selected skill only.
5. For Skill Groups, inspect `/api/skill-groups` and remind the user they are local JSON files under `.skill-universe/skill-groups/`.
6. For maintenance checks, run `scripts/check.mjs`. Use `--build` only when the user asks for a stronger release check or before publishing changes.
7. If startup, scans, AI analysis, Skill Groups, recommendations, or privacy behavior are unclear, read `references/operator-guide.md`.

## Commands

From the dashboard repository:

```bash
node skills/codex-skill-universe/scripts/launch.mjs --root . --port 5173
node skills/codex-skill-universe/scripts/check.mjs --root .
node skills/codex-skill-universe/scripts/check.mjs --root . --build
```

When this skill is installed under `~/.codex/skills/codex-skill-universe`, run the same scripts from that installed path and pass `--root` pointing to the dashboard repository.

## Boundaries

- Do not auto-install third-party skills from recommendations. Generate reviewable install plans and ask for user approval before any install.
- Do not run AI analysis in bulk or in the background. AI Skill Doctor is user-triggered and scoped to the selected skill.
- Do not upload reference contents, assets, logs, project profiles, `.env` files, local absolute paths, or secrets. AI Skill Doctor sends only selected `SKILL.md` frontmatter/body, scan metadata, headings, trigger terms, and resource names after redaction.
- Do not upload the full local skill catalog for AI Skill Group suggestions; related group members are added locally from the relation graph.
- The dashboard default sends only gap keywords for ClawHub recommendation search.
- Treat `.skill-universe/`, `.env`, `.env.local`, logs, screenshots, and project profiles as local runtime data.
