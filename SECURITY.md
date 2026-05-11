# Security

## Supported Versions

This project is pre-1.0. Security fixes target the current `main` branch.

## Reporting a Vulnerability

If you find a vulnerability, please open a private security advisory on GitHub if available, or create an issue with minimal reproduction details and no secrets.

Do not include:

- API keys
- private skill contents
- private research project data
- local machine paths that should remain private
- full logs containing sensitive data

## Security Boundaries

Skill Universe does not auto-install third-party skills. Recommendation and install-plan features generate reviewable instructions only.

Before installing a recommended skill, review:

- `SKILL.md`
- scripts and executable files
- network calls
- package install steps
- credential or API-key requirements
- prompt-injection or data-exfiltration risks

## Local Secrets

Keep secrets in `.env.local` or your shell environment. `.env.local` is ignored by git.

Never commit:

- `.env.local`
- `.skill-universe/`
- logs
- local project profiles
- local skill caches
