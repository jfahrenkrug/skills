# Agentic Legibility

A skill that helps coding agents audit and improve a repository's agentic legibility — the docs, entrypoints, and structure that let agents bootstrap, navigate, validate, and work without tribal knowledge.

## What It Does

Guides an agent through creating or maintaining the artifacts that make a codebase self-describing:

- **Root agent map** (`AGENTS.md`, `CLAUDE.md`) — a concise table of contents for agents
- **Progressive docs tree** (`docs/`) — short index files that route to deeper guidance
- **ExecPlans** — self-contained, living implementation plans for complex work
- **Architecture map** — module boundaries, dependency directions, and enforcement
- **Decision records** — ADRs capturing the why behind technical choices
- **Mechanical enforcement** — custom lint rules, structural tests, and remediation-oriented error messages
- **Scoring** — a seven-dimension scorecard evaluated from repo-visible evidence

## Installation

```
npx skills add https://github.com/jfahrenkrug/skills --skill agentic-legibility
```

Or browse at [skills.sh/jfahrenkrug/skills](https://skills.sh/jfahrenkrug/skills).

## Usage

### Initial setup

Use when a repo has little or no legibility infrastructure:

> "improve this repo's agentic legibility"
> "set up agentic legibility"
> "make this repo agent-friendly"

The agent will audit the repo, run the scorer, and create the missing artifacts.

### Maintenance

Use when the repo already has legibility infrastructure and it needs updating:

> "update agentic legibility"
> "re-score the repo"
> "the architecture changed, update AGENTS.md"

The agent will re-score, fix drift, garden docs, and tighten enforcement.

## References

This skill draws on ideas and patterns from:

- [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/)
- [Using PLANS.md for multi-hour problem solving](https://developers.openai.com/cookbook/articles/codex_exec_plans)
- [OpenAI Build Hours: Agentic Legibility](https://github.com/openai/build-hours/tree/main/24-api-codex)
- [OpenAI Build Hours episode](https://www.youtube.com/watch?v=rhsSqr0jdFw)

## License

MIT — see [LICENSE](../../LICENSE).
