# Claude Companion for Obsidian

Bring Claude *into* your vault. Chat with your notes as context, generate
gallery-grade interactive artifacts, and sync everything Claude produces back
into Markdown — so your vault stays the single source of truth.

The artifact design system is lifted directly from Anthropic's
[“unreasonable effectiveness of HTML”](../README.md) gallery that lives in this
repo, so the plans, reports, and dashboards Claude generates look like they
belong next to it.

> **Bring your own key.** Claude Companion talks to the Anthropic Messages API
> with *your* API key. Nothing is sent anywhere else. Desktop only (it needs
> direct network access).

## Features

- **Chat in a side panel** — streaming responses, Markdown-rendered, with
  per-message **Copy / Insert / Save as note** actions.
- **Vault-aware context** — toggle chips to attach your **active note**, the
  **current selection**, **linked & backlinked notes**, or a keyword
  **vault search** (lightweight RAG, no embeddings) to any message.
- **Beautiful interactive artifacts** — Claude emits a `claude-html` block;
  Companion renders it inline in a sandboxed iframe and can **save it as a
  note** that stays interactive and portable.
- **Commands**
  - *Open chat panel*
  - *Generate implementation plan from current note*
  - *Turn selection / note into a beautiful artifact*
  - *Ask Claude about my vault (search-augmented)*

## Install (manual / for now)

1. `cd obsidian-plugin && npm install && npm run build`
2. Copy `main.js`, `manifest.json`, and `styles.css` into
   `<your-vault>/.obsidian/plugins/claude-companion/`.
3. Enable **Claude Companion** in *Settings → Community plugins*.
4. Open *Settings → Claude Companion* and paste your Anthropic API key.

For active development use `npm run dev` (esbuild watch) and symlink the plugin
folder into a test vault.

## How artifacts work

When Claude returns a fenced ```` ```claude-html ```` block, Companion renders
the document inside a **sandboxed** iframe (`allow-scripts` but **not**
`allow-same-origin`) — interactions and scripts run, but the artifact can't
touch your vault, cookies, or the network. Set a height per-block with
` ```claude-html height=720 `.

Saving an artifact writes a Markdown note containing that same block, so the
artifact lives in your vault, renders in Reading view, and travels with your
notes.

## The `claude-html` block

You can author these by hand too:

````markdown
```claude-html height=600
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Hello</title></head>
<body style="font-family:ui-serif;background:#FAF9F5;padding:40px">
  <h1 style="color:#141413">It renders inline.</h1>
</body></html>
```
````

## Releasing to the community store (notes)

This plugin currently lives inside the `html-effectiveness` repo for
convenience. To submit to Obsidian's community catalog it should be extracted
into its own repository (the build output `main.js` + `manifest.json` +
`styles.css` attached to a GitHub release). Also review the plugin **name** —
Obsidian's guidelines ask you to avoid trademarks you don't own, so a release
name like *“Companion for Claude”* may be more appropriate.

## License

MIT — see [`../LICENSE`](../LICENSE).
