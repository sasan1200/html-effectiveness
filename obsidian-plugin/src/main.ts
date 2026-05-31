import { MarkdownView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { ChatView, CHAT_VIEW_TYPE } from "./view/ChatView";
import { ClaudeCompanionSettingTab } from "./settings";
import { ProviderRouter } from "./providers/router";
import { DEFAULT_SETTINGS, type PluginSettings } from "./types";
import { DESIGN_SYSTEM_PROMPT, PLANNING_INSTRUCTION } from "./artifacts/designSystem";
import { renderArtifactInline } from "./artifacts/renderInline";
import { McpHttpServer } from "./mcp/server";
import { VaultTools } from "./mcp/vaultTools";
import { extractTasks, specBody, claudeCodeBuildCommand, type SpecInput } from "./build/spec";
import { trackerArtifact } from "./build/tracker";
import { buildFrontmatter, normalizeTags } from "./indexing/frontmatter";
import { normalizePath, TFile } from "obsidian";

export default class ClaudeCompanionPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  private _router: ProviderRouter | null = null;
  private mcpServer: McpHttpServer | null = null;
  private vaultTools: VaultTools | null = null;

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

    this.addCommand({
      id: "build-from-plan",
      name: "Hand off current note to Claude Code (build)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
        if (checking) return !!file;
        void this.handoffToBuild();
        return true;
      },
    });

    this.addSettingTab(new ClaudeCompanionSettingTab(this.app, this));

    // Start the MCP bridge if enabled (deferred so it doesn't block load).
    this.app.workspace.onLayoutReady(() => void this.syncMcpServer());
  }

  onunload(): void {
    void this.mcpServer?.stop();
    this.mcpServer = null;
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
    // Rebuild providers if any credentials/hosts changed.
    this._router = null;
    this.refreshViews();
    await this.syncMcpServer();
  }

  // ---------- MCP bridge ----------

  /** Start, stop, or restart the MCP server to match current settings. */
  async syncMcpServer(): Promise<void> {
    const s = this.settings;
    // Always tear down so a port/token/writes change takes effect cleanly.
    if (this.mcpServer) {
      await this.mcpServer.stop();
      this.mcpServer = null;
    }
    if (!s.mcpEnabled) return;

    if (!this.vaultTools) {
      this.vaultTools = new VaultTools(this.app, { allowWrites: s.mcpAllowWrites, defaultFolder: s.mcpWriteFolder });
    } else {
      this.vaultTools.setOptions({ allowWrites: s.mcpAllowWrites, defaultFolder: s.mcpWriteFolder });
    }

    const server = new McpHttpServer(
      { port: s.mcpPort, token: s.mcpToken, serverInfo: { name: "obsidian-vault", version: "0.2.0" } },
      this.vaultTools,
      (level, message) => (level === "error" ? console.error("[Claude Companion MCP]", message) : console.log("[Claude Companion MCP]", message)),
    );
    try {
      await server.start();
      this.mcpServer = server;
    } catch (e) {
      new Notice(`MCP bridge failed to start on port ${s.mcpPort}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  mcpRunning(): boolean {
    return this.mcpServer?.isRunning() ?? false;
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)) {
      const v = leaf.view;
      if (v instanceof ChatView) v.refreshModelLabel();
    }
  }

  // ---------- providers ----------

  router(): ProviderRouter {
    if (!this._router) this._router = new ProviderRouter(this.settings);
    return this._router;
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

  /**
   * Turn the active note (an implementation plan) into a build spec + a live
   * tracker note, then hand it to Claude Code. Claude Code reaches the vault
   * through the MCP bridge and updates the tracker as it builds.
   */
  private async handoffToBuild(): Promise<void> {
    const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
    if (!(file instanceof TFile)) {
      new Notice("Open a plan note first.");
      return;
    }
    const plan = await this.app.vault.cachedRead(file);
    const tasks = extractTasks(plan);
    if (tasks.length === 0) {
      new Notice("No tasks/milestones found in this note to build from.");
      return;
    }

    const title = file.basename;
    const folder = this.settings.mcpWriteFolder || "Claude/Builds";
    await this.ensureFolder(folder);
    const specPath = normalizePath(`${folder}/${title} — spec.md`);
    const trackerPath = normalizePath(`${folder}/${title} — tracker.md`);

    const input: SpecInput = { title, plan, specPath, trackerPath, tasks };

    // Spec note.
    const specFm = buildFrontmatter({ title: `${title} — spec`, created: new Date().toISOString().slice(0, 10), source: "claude-companion", type: "build-spec", tags: normalizeTags(["claude", "build", "spec"]) });
    await this.writeOrReplace(specPath, `${specFm}\n\n${specBody(input)}`);

    // Tracker note (an updating claude-html artifact + a checklist Claude Code appends to).
    const trackerFm = buildFrontmatter({ title: `${title} — tracker`, created: new Date().toISOString().slice(0, 10), source: "claude-companion", type: "build-tracker", tags: normalizeTags(["claude", "build", "tracker"]) });
    const trackerBody = [trackerFm, "", `# ${title} — build tracker`, "", "```claude-html height=520", trackerArtifact(title, tasks), "```", "", "## Progress log", "", "<!-- Claude Code appends progress here -->", ""].join("\n");
    const trackerFile = await this.writeOrReplace(trackerPath, trackerBody);

    // Hand off: copy the ready-to-run command, open the tracker.
    const command = claudeCodeBuildCommand(input);
    await navigator.clipboard.writeText(command).catch(() => {});
    await this.app.workspace.getLeaf(true).openFile(trackerFile);

    const mcpNote = this.settings.mcpEnabled ? "" : " (enable the MCP bridge in settings so Claude Code can read/write the vault)";
    new Notice(`Build spec + tracker created. Claude Code command copied to clipboard${mcpNote}.`, 8000);
  }

  private async ensureFolder(folder: string): Promise<void> {
    const p = normalizePath(folder);
    if (p === "" || p === "/" || this.app.vault.getAbstractFileByPath(p)) return;
    let cur = "";
    for (const part of p.split("/")) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        try {
          await this.app.vault.createFolder(cur);
        } catch {
          /* race */
        }
      }
    }
  }

  private async writeOrReplace(path: string, content: string): Promise<TFile> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return existing;
    }
    return this.app.vault.create(path, content);
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
