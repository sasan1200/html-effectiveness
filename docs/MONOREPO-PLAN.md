# Monorepo plan: cavi-ai/claude-obsidian

This documents how the two deliverables in this fork become the unified
`cavi-ai/claude-obsidian` monorepo, and why it's structured this way.

## Why this can't be auto-pushed from a web session

Claude Code on the web sessions are scoped to an explicit repository allowlist
set at environment-creation time. This session is limited to
`sasan1200/openclaw` and `sasan1200/html-effectiveness`, so it cannot create or
push to `cavi-ai/claude-obsidian` even though the org and repo exist and you own
them. To let a future session operate on it directly:

1. Add `cavi-ai/claude-obsidian` to the environment's allowed repositories
   (Claude Code on the web settings).
2. Authorize the Claude GitHub App for the `cavi-ai` org
   (github.com → org → Settings → third-party / GitHub Apps).
3. Start a **fresh** session (the allowlist is read at session start).

Until then, use `scripts/assemble-monorepo.sh` to build and push locally.

## Target layout

```
cavi-ai/claude-obsidian/
├── README.md
├── NOTICE                         # credits Thariq Shihipar (MIT)
├── obsidian-plugin/               # Claude Companion (Obsidian community plugin)
├── claude-plugin/                 # Claude Code plugin + marketplace
│   ├── .claude-plugin/{plugin,marketplace}.json
│   ├── .mcp.json                  # obsidian-vault bridge
│   ├── commands/                  # /claude-obsidian:note-to-artifact, :build-from-spec
│   ├── skills/note-to-artifact/SKILL.md
│   └── design-system/extensions/  # additive layers (our work)
└── upstream/html-effectiveness/   # git submodule, PINNED @ 58c305b (Thariq's gallery)
```

## Provenance model

- Thariq's original gallery is included **only** as a pinned submodule
  (`upstream/html-effectiveness` @ `58c305b` — the last commit before any
  Obsidian work). It is never edited in place; it stays verbatim and clearly
  attributable to him via its own git history.
- Our artifact design system is an **original reformulation** of that aesthetic
  (`obsidian-plugin/src/artifacts/designSystem.ts` and the `note-to-artifact`
  skill), not a copy of his HTML files.
- Variations live in `claude-plugin/design-system/extensions/` as additive
  layers that override only named tokens/components.
- `NOTICE` records all of this; `./LICENSE` (MIT, Copyright (c) 2026 Anthropic
  PBC) is preserved.

## Assembly

```bash
# from a checkout of this fork:
TARGET_REMOTE=git@github.com:cavi-ai/claude-obsidian.git \
  bash scripts/assemble-monorepo.sh
# review ./claude-obsidian-monorepo, then:
git -C ./claude-obsidian-monorepo push -u origin main
```
