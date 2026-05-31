# HANDOFF — extract to cavi-ai/claude-obsidian

**For: a fresh Claude Code on the web session whose allowlist includes
`cavi-ai/claude-obsidian`.** Read this top to bottom, then execute "Your task".

## TL;DR

Everything for the `cavi-ai/claude-obsidian` monorepo already exists and is
committed in `sasan1200/html-effectiveness`, branch
`claude/obsidian-claude-plugin-Gzix7`. The previous session could **not** push
to `cavi-ai` (its allowlist was only `sasan1200/openclaw` +
`sasan1200/html-effectiveness`). Your job: assemble the monorepo and push it to
the now-accessible `cavi-ai/claude-obsidian`.

## Source of truth

- Repo: `sasan1200/html-effectiveness`
- Branch: `claude/obsidian-claude-plugin-Gzix7`
- Tip commit at handoff: `89ea226`
- Target: `cavi-ai/claude-obsidian` (empty repo, default branch `main`, already
  created by the owner)

## What's already built (do NOT rebuild)

| Path | What it is | State |
|---|---|---|
| `obsidian-plugin/` | **Claude Companion** Obsidian community plugin (v0.4.0) | 116/116 tests green; typecheck/lint/build clean |
| `claude-plugin/` | **claude-obsidian** Claude Code plugin (v0.1.0): plugin.json, marketplace.json, .mcp.json, 2 commands, note-to-artifact skill, design-system/extensions/ (README + research-dashboard.md) | complete, JSON validated |
| `NOTICE` | Credits Thariq Shihipar (MIT, ./LICENSE © 2026 Anthropic PBC) | corrected/accurate |
| `scripts/assemble-monorepo.sh` | Builds the monorepo: copies our code, adds Thariq's gallery as a **pinned submodule** | `bash -n` clean |
| `docs/MONOREPO-PLAN.md` | Target layout + provenance model | — |

## Key facts / decisions (already settled with the owner)

- **Two deliverables, one monorepo** in `cavi-ai`: the Obsidian plugin and the
  Claude Code plugin.
- **Thariq's original gallery is included as a PINNED git submodule** at
  `upstream/html-effectiveness`, pinned to commit **`58c305b`** (the last
  pure-upstream commit before any Obsidian work). Never edit it in place.
- Our design system is an **original reformulation**, not a copy of his HTML.
- Variations go in `claude-plugin/design-system/extensions/` as additive layers.
- Plugin naming: Obsidian plugin is "Claude Companion" (rename to "Companion for
  Claude" still an OPEN question re: trademark — confirm with owner before any
  public store submission; not blocking the monorepo push).

## Target layout

```
cavi-ai/claude-obsidian/
├── README.md
├── NOTICE
├── obsidian-plugin/               # Claude Companion
├── claude-plugin/                 # Claude Code plugin + marketplace
└── upstream/html-effectiveness/   # submodule, PINNED @ 58c305b (Thariq's gallery)
```

## Your task

1. Confirm access: `mcp__github__list_branches` on `cavi-ai/claude-obsidian`
   succeeds. If it still returns "not configured for this session", STOP — the
   allowlist wasn't updated; tell the owner to add `cavi-ai/claude-obsidian` to
   the environment's allowed repositories and start another fresh session.
2. Get this branch's content. Either:
   - clone `sasan1200/html-effectiveness` @ `claude/obsidian-claude-plugin-Gzix7`,
     then run `scripts/assemble-monorepo.sh` (set
     `TARGET_REMOTE` to the cavi-ai repo), **or**
   - assemble manually per `docs/MONOREPO-PLAN.md`.
3. Verify before pushing:
   - `cd obsidian-plugin && npm ci && npm test` → expect **116 passed**
   - `npm run build` → `main.js` produced
   - submodule resolves and is pinned to `58c305b`
   - all `claude-plugin/**/*.json` parse
4. Push to `cavi-ai/claude-obsidian` `main` (use `git push -u`, retry on network
   error with backoff).
5. Open a **draft PR** if you used a branch; otherwise confirm `main` is
   populated.
6. Report back: commit SHA pushed, test result, submodule pin confirmed.

## Gotchas learned the hard way

- Do **not** `git submodule add` inside `html-effectiveness` itself — it would
  be self-referential. The submodule only exists in the *target* monorepo.
- The allowlist is environment config read at **session start** — it cannot be
  changed mid-session and is not a file in the repo.
- Keep the model identifier out of commits/PRs (chat-only).
- Commit message footer required by this environment ends with the session URL.
