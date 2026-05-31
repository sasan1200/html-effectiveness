// Shared types for the Claude Companion plugin.

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  /** Raw markdown content of the message. */
  content: string;
}

export interface ContextToggles {
  activeNote: boolean;
  selection: boolean;
  linkedNotes: boolean;
  searchVault: boolean;
}

export interface ClaudeModel {
  id: string;
  label: string;
  hint?: string;
}

export interface PluginSettings {
  apiKey: string;
  model: string;
  customModel: string;
  maxTokens: number;
  systemPrompt: string;
  artifactFolder: string;
  chatFolder: string;
  context: ContextToggles;
  /** Max characters of vault context to attach to a request. */
  contextCharBudget: number;
  /** How many linked / search-matched notes to include. */
  maxContextNotes: number;
  /** Default render height (px) for inline `claude-html` artifacts. */
  artifactHeight: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  apiKey: "",
  model: "claude-sonnet-4-6",
  customModel: "",
  maxTokens: 4096,
  systemPrompt:
    "You are Claude, working inside the user's Obsidian vault. Be concise and precise. " +
    "When the user asks for a plan, report, diagram, or anything visual, prefer producing a single " +
    "self-contained HTML artifact in a ```claude-html code block using the provided design system.",
  artifactFolder: "Claude/Artifacts",
  chatFolder: "Claude/Chats",
  context: {
    activeNote: true,
    selection: true,
    linkedNotes: false,
    searchVault: false,
  },
  contextCharBudget: 24000,
  maxContextNotes: 6,
  artifactHeight: 640,
};

/** Streaming callbacks for a single Claude request. */
export interface StreamHandlers {
  onText: (delta: string) => void;
  onDone?: (full: string) => void;
  onError?: (err: Error) => void;
}
