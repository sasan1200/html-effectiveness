import { MarkdownView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { ChatView, CHAT_VIEW_TYPE } from "./view/ChatView";
import { ClaudeCompanionSettingTab } from "./settings";
import { ClaudeClient } from "./claude/client";
import { DEFAULT_SETTINGS, type PluginSettings } from "./types";
import { DESIGN_SYSTEM_PROMPT, PLANNING_INSTRUCTION } from "./artifacts/designSystem";
import { renderArtifactInline } from "./artifacts/renderInline";

export default class ClaudeCompanionPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  private client: ClaudeClient | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(CHAT_VIEW_TYPE, (leaf: WorkspaceLeaf) => new ChatView(leaf, this));

    // Inline interactive artifacts: ```claude-html ... ```
    this.registerMarkdownCodeBlockProcessor("claude-html", (source, el, ctx) => {
      let height = this.settings.artifactHeight;
      let title = "Claude artifact";
      const info = ctx.getSectionInfo(el);
      if (info) {
        const fence = info.text.split("\n")[info.lineStart] ?? "";
        const m = /height=(\d+)/.exec(fence);
        if (m) height = parseInt(m[1], 10);
      }
      const t = /<title>([^<]+)<\/title>/i.exec(source);
      if (t) title = t[1].trim();
      renderArtifactInline(el, source, height, title);
    });

    this.addRibbonIcon("sparkles", "Open Claude Companion", () => void this.activateView());

    this.addCommand({
      id: "open-chat",
      name: "Open chat panel",
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: "new-chat",
      name: "New chat",
      callback: async () => {
        const view = await this.activateView();
        view?.clearChat();
      },
    });

    this.addCommand({
      id: "plan-from-note",
      name: "Generate implementation plan from current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
        if (checking) return !!file;
        void this.generatePlanFromNote();
        return true;
      },
    });

    this.addCommand({
      id: "artifact-from-selection",
      name: "Turn selection / note into a beautiful artifact",
      callback: () => void this.generateArtifactFromContext(),
    });

    this.addCommand({
      id: "ask-vault",
      name: "Ask Claude about my vault (search-augmented)",
      callback: async () => {
        this.settings.context.searchVault = true;
        await this.saveSettings();
        const view = await this.activateView();
        view?.refreshModelLabel();
        new Notice("Vault search is on — ask your question in the chat panel.");
      },
    });

    this.addSettingTab(new ClaudeCompanionSettingTab(this.app, this));
  }

  onunload(): void {
    // Obsidian detaches the view's leaves automatically.
  }

  // ---------- settings ----------

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<PluginSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      context: { ...DEFAULT_SETTINGS.context, ...(data?.context ?? {}) },
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Rebuild the client if the key changed.
    this.client = null;
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)) {
      const v = leaf.view;
      if (v instanceof ChatView) v.refreshModelLabel();
    }
  }

  // ---------- client ----------

  getClient(): ClaudeClient {
    if (!this.client) this.client = new ClaudeClient(this.settings.apiKey);
    return this.client;
  }

  composeSystemPrompt(): string {
    return `${this.settings.systemPrompt}\n\n${DESIGN_SYSTEM_PROMPT}`;
  }

  // ---------- view ----------

  async activateView(): Promise<ChatView | null> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
      return leaf.view instanceof ChatView ? leaf.view : null;
    }
    return null;
  }

  // ---------- command helpers ----------

  private async generatePlanFromNote(): Promise<void> {
    this.settings.context.activeNote = true;
    await this.saveSettings();
    const view = await this.activateView();
    if (!view) return;
    await view.submitPrompt(`${PLANNING_INSTRUCTION}\n\nBase the plan entirely on the content of my current note.`);
  }

  private async generateArtifactFromContext(): Promise<void> {
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const hasSelection = !!mdView?.editor.getSelection().trim();
    this.settings.context.activeNote = true;
    this.settings.context.selection = true;
    await this.saveSettings();
    const view = await this.activateView();
    if (!view) return;
    const target = hasSelection ? "the selected text" : "my current note";
    await view.submitPrompt(`Turn ${target} into a single beautiful, self-contained interactive artifact (a \`\`\`claude-html block) using the design system. Choose the best format (plan, report, table, diagram, or dashboard) for the content.`);
  }
}
