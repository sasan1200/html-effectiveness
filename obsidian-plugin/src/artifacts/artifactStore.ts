import { App, Notice, TFile, normalizePath } from "obsidian";

export interface ExtractedArtifact {
  /** Inner HTML (a full document) extracted from a ```claude-html block. */
  html: string;
  /** A best-effort title pulled from <title> or the first heading. */
  title: string;
}

const CLAUDE_HTML_RE = /```claude-html[^\n]*\n([\s\S]*?)```/i;
// Also accept a plain ```html block that contains a full document.
const HTML_DOC_RE = /```html[^\n]*\n(\s*<!DOCTYPE[\s\S]*?)```/i;

/** Find the first renderable HTML artifact inside an assistant message. */
export function extractArtifact(markdown: string): ExtractedArtifact | null {
  const m = CLAUDE_HTML_RE.exec(markdown) ?? HTML_DOC_RE.exec(markdown);
  if (!m) return null;
  const html = m[1].trim();
  return { html, title: titleFromHtml(html) };
}

function titleFromHtml(html: string): string {
  const t = /<title>([^<]+)<\/title>/i.exec(html);
  if (t) return t[1].trim();
  const h = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h) return h[1].replace(/<[^>]+>/g, "").trim();
  return "Claude artifact";
}

function sanitizeFileName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|#^[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "Untitled"
  );
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  const path = normalizePath(folder);
  if (path === "" || path === "/") return;
  if (app.vault.getAbstractFileByPath(path)) return;
  // Create nested folders segment by segment.
  const parts = path.split("/");
  let cur = "";
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(cur)) {
      try {
        await app.vault.createFolder(cur);
      } catch {
        /* race: already exists */
      }
    }
  }
}

async function writeUnique(app: App, folder: string, base: string, ext: string, content: string): Promise<TFile> {
  await ensureFolder(app, folder);
  const safe = sanitizeFileName(base);
  let path = normalizePath(`${folder}/${safe}.${ext}`);
  let i = 2;
  while (app.vault.getAbstractFileByPath(path)) {
    path = normalizePath(`${folder}/${safe} ${i}.${ext}`);
    i++;
  }
  return app.vault.create(path, content);
}

/**
 * Save an HTML artifact as a markdown note that renders inline via the
 * `claude-html` code-block processor. This keeps the artifact portable,
 * editable, and previewable inside the vault.
 */
export async function saveArtifactNote(
  app: App,
  folder: string,
  artifact: ExtractedArtifact,
  height: number,
): Promise<TFile> {
  const created = new Date().toISOString();
  const note = [
    "---",
    `created: ${created}`,
    "source: claude-companion",
    "type: artifact",
    "---",
    "",
    `# ${artifact.title}`,
    "",
    "```claude-html height=" + height,
    artifact.html,
    "```",
    "",
  ].join("\n");
  const file = await writeUnique(app, folder, artifact.title, "md", note);
  new Notice(`Saved artifact → ${file.path}`);
  return file;
}

/** Save a chat transcript as a markdown note. */
export async function saveChatNote(app: App, folder: string, title: string, markdown: string): Promise<TFile> {
  const front = ["---", `created: ${new Date().toISOString()}`, "source: claude-companion", "type: chat", "---", "", `# ${title}`, "", markdown, ""].join("\n");
  const file = await writeUnique(app, folder, title, "md", front);
  new Notice(`Saved chat → ${file.path}`);
  return file;
}
