# Privacy

Codex Skill Universe is local-first by design.

## What Is Scanned

The app scans:

- local Codex skill folders
- plugin-contributed skill folders under the Codex plugin cache
- `SKILL.md` metadata and lightweight resource structure

The scanner summarizes skill metadata such as name, description, headings, trigger terms, domains, and resource counts.

## What Is Stored Locally

The following data is stored locally and ignored by git:

- `.env.local`
- `.skill-universe/`
- embedding cache
- recommendation cache
- visual-check screenshots
- local research project profiles under `.skill-universe/projects/*.json`
- logs

## External Requests

Default local mode does not require an API key.

When recommendation refresh is used, the app may send gap search keywords to ClawHub, such as `scientific data visualization` or `patent prior art search`. It does not send local skill contents, local paths, logs, project profiles, API keys, or full references/assets text.

When optional OpenAI embeddings are configured, the app sends summarized skill metadata only by default:

- name
- description
- headings
- trigger terms
- resource inventory

By default, it does not send full references or asset text.

## Research Mission Mode

Research Mission Mode stores project profiles in `.skill-universe/projects/*.json`. These files are local working data and are ignored by git. They may contain research directions, paper notes, experiment paths, claims, or other private project context.

Do not publish `.skill-universe/`.

## Recommended Before Publishing

Before pushing to a public repository, verify:

```bash
git status --ignored --short
npm run test:privacy
```

Also inspect staged files:

```bash
git diff --cached --name-only
```
