import { App, PluginSettingTab, Setting } from "obsidian";
import type ClaudeCompanionPlugin from "./main";
import { CLAUDE_MODELS } from "./claude/models";

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
  }
}
