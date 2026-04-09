# Skills

A collection of reusable AI coding agent skills. These skills work across multiple agent platforms including Claude Code, OpenAI Codex, and others that support the [Agent Skills](https://agentskills.io) standard.

## Available Skills

### [Agentic Legibility](skills/agentic-legibility/)

Audit and improve a repository so coding agents can bootstrap, navigate, validate, and work without tribal knowledge. Covers root agent maps (`AGENTS.md`, `CLAUDE.md`), progressive docs trees, ExecPlans, architecture maps, decision records, mechanical enforcement, and scoring.

Includes a scoring script that evaluates repositories across seven dimensions from repo-visible evidence only.

## Installation

Install skills using [skills.sh](https://skills.sh):

```
npx skills add https://github.com/jfahrenkrug/skills
```

Or install a specific skill:

```
npx skills add https://github.com/jfahrenkrug/skills --skill agentic-legibility
```

Browse available skills at [skills.sh/jfahrenkrug/skills](https://skills.sh/jfahrenkrug/skills).

### Manual installation

Each skill lives in its own directory under `skills/` and contains a `SKILL.md` with instructions and metadata. To install manually:

1. **Vendor it** into your repository's `.claude/skills/` (Claude Code), `.agents/skills/` (Codex), or equivalent skill directory.
2. **Invoke it** via the agent's skill mechanism (e.g., `/agentic-legibility` in Claude Code or `$agentic-legibility` in Codex).

See each skill's `SKILL.md` for detailed usage.

## References

The agentic legibility skill draws on ideas and patterns from:

- [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/) — OpenAI's writeup on making repositories legible to coding agents at scale.
- [Using PLANS.md for multi-hour problem solving](https://developers.openai.com/cookbook/articles/codex_exec_plans) — OpenAI Cookbook article on ExecPlans as living, self-contained execution documents.
- [OpenAI Build Hours: Agentic Legibility](https://github.com/openai/build-hours/tree/main/24-api-codex) — Companion repository with the seven-dimension scorecard and scoring tool.
- [OpenAI Build Hours episode](https://www.youtube.com/watch?v=rhsSqr0jdFw) — Video walkthrough of the agentic legibility approach.

## License

MIT — see [LICENSE](LICENSE).
