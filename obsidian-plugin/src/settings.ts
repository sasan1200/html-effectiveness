import { App, PluginSettingTab, Setting } from "obsidian";
import type ClaudeCompanionPlugin from "./main";
import { CLAUDE_MODELS } from "./claude/models";
import type { ProviderStatus } from "./providers/types";

export class ClaudeCompanionSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: ClaudeCompanionPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Connection").setHeading();

    new Setting(containerEl)
      .setName("Anthropic API key")
      .setDesc("Bring your own key from console.anthropic.com. Stored locally in this vault's plugin data.")
      .addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.style.width = "320px";
        text
          .setPlaceholder("sk-ant-…")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (v) => {
            this.plugin.settings.apiKey = v.trim();
            await this.plugin.saveSettings();
          });
      });

    // Save & Test connection — explicit confirmation that settings are saved
    // and the key actually works.
    const claudeStatus = containerEl.createDiv({ cls: "cc-conn-status" });
    new Setting(containerEl)
      .setName("Save & test connection")
      .setDesc("Saves settings and sends a tiny request to verify your Anthropic key.")
      .addButton((btn) =>
        btn
          .setButtonText("Save & test")
          .setCta()
          .onClick(async () => {
            await this.plugin.saveSettings();
            this.renderStatus(claudeStatus, { ok: true, detail: "Testing…" });
            const status = await this.plugin.router().anthropic.test();
            this.renderStatus(claudeStatus, status);
          }),
      );

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Pick a default model. A custom id below overrides this.")
      .addDropdown((dd) => {
        for (const m of CLAUDE_MODELS) dd.addOption(m.id, m.label);
        dd.setValue(this.plugin.settings.model).onChange(async (v) => {
          this.plugin.settings.model = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        });
      });

    new Setting(containerEl)
      .setName("Custom model id")
      .setDesc("Optional. Overrides the dropdown — useful for new or dated model snapshots.")
      .addText((text) =>
        text
          .setPlaceholder("e.g. claude-sonnet-4-6-20250930")
          .setValue(this.plugin.settings.customModel)
          .onChange(async (v) => {
            this.plugin.settings.customModel = v.trim();
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          }),
      );

    new Setting(containerEl)
      .setName("Max response tokens")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.maxTokens)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) {
            this.plugin.settings.maxTokens = Math.min(n, 64000);
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl).setName("Behavior").setHeading();

    new Setting(containerEl)
      .setName("System prompt")
      .setDesc("Prepended to every conversation. The artifact design system is always appended automatically.")
      .addTextArea((ta) => {
        ta.inputEl.rows = 5;
        ta.inputEl.style.width = "100%";
        ta.setValue(this.plugin.settings.systemPrompt).onChange(async (v) => {
          this.plugin.settings.systemPrompt = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Context character budget")
      .setDesc("Max characters of vault context attached to a request.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.contextCharBudget)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) {
            this.plugin.settings.contextCharBudget = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Max context notes")
      .setDesc("How many linked / search-matched notes to include.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.maxContextNotes)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n >= 0) {
            this.plugin.settings.maxContextNotes = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl).setName("Storage").setHeading();

    new Setting(containerEl)
      .setName("Artifacts folder")
      .setDesc("Where saved artifacts (interactive HTML notes) are written.")
      .addText((text) =>
        text.setValue(this.plugin.settings.artifactFolder).onChange(async (v) => {
          this.plugin.settings.artifactFolder = v.trim() || "Claude/Artifacts";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Chats folder")
      .setDesc("Where saved chat transcripts are written.")
      .addText((text) =>
        text.setValue(this.plugin.settings.chatFolder).onChange(async (v) => {
          this.plugin.settings.chatFolder = v.trim() || "Claude/Chats";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Inline artifact height")
      .setDesc("Default pixel height for artifacts rendered inside notes.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.artifactHeight)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) {
            this.plugin.settings.artifactHeight = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    // ---------- local models (Ollama) ----------
    new Setting(containerEl).setName("Local models (Ollama)").setHeading();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Run cheap, bulk work — summarizing, tagging, ingestion — on a local model to save Anthropic tokens. Chat and plans still use Claude unless you route them here.",
    });

    new Setting(containerEl)
      .setName("Use local model for utility tasks")
      .setDesc("Summaries, auto-tagging, and ingestion go to Ollama instead of Claude.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.localUtilityEnabled).onChange(async (v) => {
          this.plugin.settings.localUtilityEnabled = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Ollama host")
      .setDesc("Base URL of your local Ollama server.")
      .addText((text) =>
        text.setValue(this.plugin.settings.ollamaHost).onChange(async (v) => {
          this.plugin.settings.ollamaHost = v.trim() || "http://localhost:11434";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Local model")
      .setDesc("Model name as listed by `ollama list` (e.g. llama3.1, qwen2.5, mistral).")
      .addText((text) =>
        text.setValue(this.plugin.settings.ollamaModel).onChange(async (v) => {
          this.plugin.settings.ollamaModel = v.trim() || "llama3.1";
          await this.plugin.saveSettings();
        }),
      );

    const ollamaStatus = containerEl.createDiv({ cls: "cc-conn-status" });
    new Setting(containerEl)
      .setName("Test local connection")
      .setDesc("Checks that Ollama is reachable and lists pulled models.")
      .addButton((btn) =>
        btn.setButtonText("Test Ollama").onClick(async () => {
          await this.plugin.saveSettings();
          this.renderStatus(ollamaStatus, { ok: true, detail: "Testing…" });
          this.renderStatus(ollamaStatus, await this.plugin.router().ollama.test());
        }),
      );

    // ---------- indexing ----------
    new Setting(containerEl).setName("Indexing & tags").setHeading();

    new Setting(containerEl)
      .setName("Auto-tag on save")
      .setDesc("When saving an artifact or chat, generate topic tags + a one-line summary (uses the utility provider above) so notes are indexed correctly.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoTagOnSave).onChange(async (v) => {
          this.plugin.settings.autoTagOnSave = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Artifact base tags")
      .setDesc("Comma-separated tags every saved artifact gets (for reliable filtering).")
      .addText((text) =>
        text.setValue(this.plugin.settings.artifactBaseTags.join(", ")).onChange(async (v) => {
          this.plugin.settings.artifactBaseTags = splitTags(v);
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Chat base tags")
      .setDesc("Comma-separated tags every saved chat gets.")
      .addText((text) =>
        text.setValue(this.plugin.settings.chatBaseTags.join(", ")).onChange(async (v) => {
          this.plugin.settings.chatBaseTags = splitTags(v);
          await this.plugin.saveSettings();
        }),
      );
  }

  private renderStatus(el: HTMLElement, status: ProviderStatus): void {
    el.empty();
    el.toggleClass("is-ok", status.ok);
    el.toggleClass("is-err", !status.ok);
    el.setText((status.ok ? "✓ " : "✗ ") + status.detail);
  }
}

function splitTags(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
