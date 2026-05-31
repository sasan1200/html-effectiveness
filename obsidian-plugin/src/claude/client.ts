import { requestUrl } from "obsidian";
import type { ChatMessage, StreamHandlers } from "../types";
import { parseSseChunk, extractApiError } from "./sse";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export interface RequestOptions {
  system: string;
  messages: ChatMessage[];
  model: string;
  maxTokens: number;
  signal?: AbortSignal;
}

export class ClaudeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ClaudeError";
  }
}

export class ClaudeClient {
  constructor(private apiKey: string) {}

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": API_VERSION,
      // Required to call the API directly from a browser-like (Electron) runtime.
      "anthropic-dangerous-direct-browser-access": "true",
    };
  }

  hasKey(): boolean {
    return this.apiKey.trim().length > 0;
  }

  private body(opts: RequestOptions, stream: boolean): string {
    return JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system || undefined,
      stream,
      messages: opts.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });
  }

  /**
   * Stream a completion using SSE. Falls back to a buffered request if the
   * streaming body is unavailable for any reason.
   */
  async stream(opts: RequestOptions, handlers: StreamHandlers): Promise<void> {
    if (!this.hasKey()) {
      handlers.onError?.(new ClaudeError("No Anthropic API key set. Add one in Claude Companion settings."));
      return;
    }
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: this.headers(),
        body: this.body(opts, true),
        signal: opts.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new ClaudeError(extractApiError(text, res.status), res.status);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { text, remainder, error } = parseSseChunk(buffer);
        buffer = remainder;
        if (error) throw new ClaudeError(error);
        if (text) {
          full += text;
          handlers.onText(text);
        }
      }
      handlers.onDone?.(full);
    } catch (err) {
      if (isAbort(err)) return; // user-initiated stop, not an error
      // Fall back to a non-streaming request once, in case fetch streaming is blocked.
      try {
        const full = await this.complete(opts);
        handlers.onText(full);
        handlers.onDone?.(full);
      } catch (err2) {
        handlers.onError?.(err2 instanceof Error ? err2 : new ClaudeError(String(err2)));
      }
    }
  }

  /** Buffered (non-streaming) completion using Obsidian's CORS-free request. */
  async complete(opts: RequestOptions): Promise<string> {
    const res = await requestUrl({
      url: API_URL,
      method: "POST",
      headers: this.headers(),
      body: this.body(opts, false),
      throw: false,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new ClaudeError(extractApiError(res.text, res.status), res.status);
    }
    const data = res.json as MessageResponse;
    return (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
  }
}

interface MessageResponse {
  content?: Array<{ type: string; text?: string }>;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
