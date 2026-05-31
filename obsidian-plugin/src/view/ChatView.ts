import { ItemView, MarkdownRenderer, MarkdownView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type ClaudeCompanionPlugin from "../main";
import type { ChatMessage } from "../types";
import { resolveModelId, modelLabel } from "../claude/models";
import { gatherContext } from "../context/vaultContext";
import { extractArtifact, saveArtifactNote, saveChatNote } from "../artifacts/artifactStore";

export const CHAT_VIEW_TYPE = "claude-companion-chat";

export class ChatView extends ItemView {
  private messages: ChatMessage[] = [];
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private modelLabelEl!: HTMLElement;
  private streaming = false;
  private abort: AbortController | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: ClaudeCompanionPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return CHAT_VIEW_TYPE;
  }
  getDisplayText(): string {
    return "Claude Companion";
  }
  getIcon(): string {
    return "sparkles";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("cc-root");

    // ---- header ----
    const header = root.createDiv({ cls: "cc-header" });
    const title = header.createDiv({ cls: "cc-title" });
    title.createSpan({ cls: "cc-eyebrow", text: "CLAUDE COMPANION" });
    this.modelLabelEl = title.createSpan({ cls: "cc-model" });
    const actions = header.createDiv({ cls: "cc-header-actions" });
    this.iconButton(actions, "plus", "New chat", () => this.clearChat());
    this.iconButton(actions, "save", "Save chat to vault", () => this.saveChat());
    this.iconButton(actions, "settings", "Open settings", () => this.openSettings());

    // ---- context chips ----
    const chips = root.createDiv({ cls: "cc-chips" });
    this.contextChip(chips, "Note", "activeNote");
    this.contextChip(chips, "Selection", "selection");
    this.contextChip(chips, "Links", "linkedNotes");
    this.contextChip(chips, "Search vault", "searchVault");

    // ---- messages ----
    this.messagesEl = root.createDiv({ cls: "cc-messages" });

    // ---- composer ----
    const composer = root.createDiv({ cls: "cc-composer" });
    this.inputEl = composer.createEl("textarea", {
      cls: "cc-input",
      attr: { placeholder: "Ask Claude…  (Enter to send, Shift+Enter for newline)", rows: "3" },
    });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.onSend();
      }
    });
    this.sendBtn = composer.createEl("button", { cls: "cc-send", text: "Send" });
    this.sendBtn.addEventListener("click", () => this.onSend());

    this.refreshModelLabel();
    this.renderEmptyState();
  }

  async onClose(): Promise<void> {
    this.abort?.abort();
  }

  refreshModelLabel(): void {
    const id = resolveModelId(this.plugin.settings.model, this.plugin.settings.customModel);
    this.modelLabelEl.setText(modelLabel(id));
  }

  // ---------- public entry point (used by commands) ----------

  async submitPrompt(text: string): Promise<void> {
    if (!text.trim() || this.streaming) return;
    this.inputEl.value = "";
    await this.run(text.trim());
  }

  // ---------- UI helpers ----------

  private iconButton(parent: HTMLElement, icon: string, tip: string, onClick: () => void): void {
    const btn = parent.createEl("button", { cls: "cc-icon-btn", attr: { "aria-label": tip } });
    setIcon(btn, icon);
    btn.addEventListener("click", onClick);
  }

  private contextChip(parent: HTMLElement, label: string, key: keyof typeof this.plugin.settings.context): void {
    const chip = parent.createEl("button", { cls: "cc-chip", text: label });
    const sync = () => chip.toggleClass("is-active", this.plugin.settings.context[key]);
    sync();
    chip.addEventListener("click", async () => {
      this.plugin.settings.context[key] = !this.plugin.settings.context[key];
      await this.plugin.saveSettings();
      sync();
    });
  }

  private renderEmptyState(): void {
    if (this.messages.length > 0) return;
    this.messagesEl.empty();
    const empty = this.messagesEl.createDiv({ cls: "cc-empty" });
    empty.createDiv({ cls: "cc-empty-title", text: "Claude, in your vault." });
    empty.createDiv({
      cls: "cc-empty-sub",
      text: "Ask a question, plan a feature, or turn a note into a beautiful artifact. Toggle the chips above to give Claude context from your notes.",
    });
  }

  clearChat(): void {
    this.abort?.abort();
    this.streaming = false;
    this.messages = [];
    this.messagesEl.empty();
    this.renderEmptyState();
    this.setSending(false);
  }

  private openSettings(): void {
    // @ts-expect-error – setting is available on the app at runtime
    this.app.setting?.open?.();
    // @ts-expect-error – open the plugin's tab if possible
    this.app.setting?.openTabById?.("claude-companion");
  }

  // ---------- send / stream ----------

  private async onSend(): Promise<void> {
    if (this.streaming) {
      this.abort?.abort();
      return;
    }
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.inputEl.value = "";
    await this.run(text);
  }

  private setSending(sending: boolean): void {
    this.streaming = sending;
    this.sendBtn.setText(sending ? "Stop" : "Send");
    this.sendBtn.toggleClass("is-stop", sending);
  }

  private async run(userText: string): Promise<void> {
    const client = this.plugin.getClient();
    if (!client.hasKey()) {
      new Notice("Add your Anthropic API key in Claude Companion settings first.");
      return;
    }

    this.messages.push({ role: "user", content: userText });
    this.renderMessage("user", userText);

    // Build context-augmented copy of the message list for the API.
    const ctx = await gatherContext(this.app, this.plugin.settings, this.plugin.settings.context, userText);
    const apiMessages: ChatMessage[] = this.messages.map((m) => ({ ...m }));
    if (ctx.text) {
      const last = apiMessages[apiMessages.length - 1];
      last.content = `${ctx.text}\n\n---\n\n${last.content}`;
      this.annotateContext(ctx.sources);
    }

    // Prepare the assistant bubble.
    const { bubble, body } = this.createAssistantBubble();
    this.setSending(true);
    this.abort = new AbortController();

    let buffer = "";
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      void this.renderMarkdownInto(body, buffer);
      this.scrollToBottom();
    };

    await client.stream(
      {
        system: this.plugin.composeSystemPrompt(),
        messages: apiMessages,
        model: resolveModelId(this.plugin.settings.model, this.plugin.settings.customModel),
        maxTokens: this.plugin.settings.maxTokens,
        signal: this.abort.signal,
      },
      {
        onText: (delta) => {
          buffer += delta;
          if (!scheduled) {
            scheduled = true;
            window.requestAnimationFrame(flush);
          }
        },
        onError: (err) => {
          body.empty();
          body.createDiv({ cls: "cc-error", text: err.message });
          this.finishAssistant(null, bubble);
        },
        onDone: (full) => {
          buffer = full;
          void this.renderMarkdownInto(body, full).then(() => this.finishAssistant(full, bubble));
        },
      },
    );

    // If the stream ended without onDone (aborted), still close out.
    if (this.streaming) this.finishAssistant(buffer || null, bubble);
  }

  private finishAssistant(full: string | null, bubble: HTMLElement): void {
    this.setSending(false);
    this.abort = null;
    if (full && full.trim().length > 0) {
      this.messages.push({ role: "assistant", content: full });
      this.addAssistantActions(bubble, full);
    }
    this.scrollToBottom();
  }

  // ---------- rendering ----------

  private createAssistantBubble(): { bubble: HTMLElement; body: HTMLElement } {
    const bubble = this.messagesEl.createDiv({ cls: "cc-msg cc-assistant" });
    bubble.createDiv({ cls: "cc-role", text: "Claude" });
    const body = bubble.createDiv({ cls: "cc-body" });
    body.createSpan({ cls: "cc-cursor", text: "▍" });
    this.scrollToBottom();
    return { bubble, body };
  }

  private renderMessage(role: "user" | "assistant", text: string): void {
    if (this.messages.length === 1) this.messagesEl.empty();
    const bubble = this.messagesEl.createDiv({ cls: `cc-msg cc-${role}` });
    bubble.createDiv({ cls: "cc-role", text: role === "user" ? "You" : "Claude" });
    const body = bubble.createDiv({ cls: "cc-body" });
    void this.renderMarkdownInto(body, text);
    this.scrollToBottom();
  }

  private annotateContext(sources: string[]): void {
    if (sources.length === 0) return;
    const last = this.messagesEl.lastElementChild;
    if (!last) return;
    last.createDiv({ cls: "cc-context-note", text: `+ context: ${sources.join(", ")}` });
  }

  private async renderMarkdownInto(el: HTMLElement, markdown: string): Promise<void> {
    el.empty();
    await MarkdownRenderer.render(this.app, markdown, el, this.app.workspace.getActiveFile()?.path ?? "", this);
  }

  private addAssistantActions(bubble: HTMLElement, full: string): void {
    const bar = bubble.createDiv({ cls: "cc-actions" });
    this.actionBtn(bar, "Copy", () => {
      void navigator.clipboard.writeText(full);
      new Notice("Copied to clipboard");
    });
    this.actionBtn(bar, "Insert", () => this.insertIntoNote(full));
    this.actionBtn(bar, "Save as note", async () => {
      const title = full.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").slice(0, 60) ?? "Claude reply";
      await saveChatNote(this.app, this.plugin.settings.chatFolder, title, full);
    });
    const artifact = extractArtifact(full);
    if (artifact) {
      const btn = this.actionBtn(bar, "Save artifact", async () => {
        const file = await saveArtifactNote(this.app, this.plugin.settings.artifactFolder, artifact, this.plugin.settings.artifactHeight);
        await this.app.workspace.getLeaf(true).openFile(file);
      });
      btn.addClass("cc-accent");
    }
  }

  private actionBtn(bar: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
    const btn = bar.createEl("button", { cls: "cc-action", text: label });
    btn.addEventListener("click", onClick);
    return btn;
  }

  private insertIntoNote(text: string): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("Open a note to insert into.");
      return;
    }
    view.editor.replaceSelection(text);
    new Notice("Inserted into note");
  }

  private async saveChat(): Promise<void> {
    if (this.messages.length === 0) {
      new Notice("Nothing to save yet.");
      return;
    }
    const md = this.messages.map((m) => `**${m.role === "user" ? "You" : "Claude"}:**\n\n${m.content}`).join("\n\n---\n\n");
    const title = this.messages[0].content.split("\n")[0].slice(0, 60) || "Claude chat";
    await saveChatNote(this.app, this.plugin.settings.chatFolder, title, md);
  }

  private scrollToBottom(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}
