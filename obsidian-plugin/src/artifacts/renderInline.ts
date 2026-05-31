import { setIcon } from "obsidian";

/**
 * Render an HTML artifact inline inside a note using a sandboxed iframe.
 *
 * The iframe is sandboxed WITHOUT `allow-same-origin`, so artifact scripts can
 * run (charts, toggles, interactions) but cannot read cookies, the vault, or
 * make same-origin requests — a safe way to embed model-generated HTML.
 */
export function renderArtifactInline(el: HTMLElement, html: string, height: number, title: string): void {
  const wrap = el.createDiv({ cls: "cc-artifact" });

  const bar = wrap.createDiv({ cls: "cc-artifact-bar" });
  const label = bar.createDiv({ cls: "cc-artifact-label" });
  setIcon(label.createSpan({ cls: "cc-artifact-icon" }), "layout-dashboard");
  label.createSpan({ text: title });

  const openBtn = bar.createEl("button", { cls: "cc-artifact-open", attr: { "aria-label": "Open artifact in a new window" } });
  openBtn.setText("Open ↗");
  openBtn.addEventListener("click", () => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });

  const iframe = wrap.createEl("iframe", { cls: "cc-artifact-frame" });
  iframe.setAttribute("sandbox", "allow-scripts allow-popups");
  iframe.setAttribute("loading", "lazy");
  iframe.style.height = `${Math.max(120, height)}px`;
  iframe.srcdoc = html;
}
