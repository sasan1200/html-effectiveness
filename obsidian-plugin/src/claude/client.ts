import { requestUrl } from "obsidian";
import type { ChatMessage, StreamHandlers } from "../types";

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

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]" || payload.length === 0) continue;

          let evt: SseEvent;
          try {
            evt = JSON.parse(payload) as SseEvent;
          } catch {
            continue;
          }
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
            full += evt.delta.text;
            handlers.onText(evt.delta.text);
          } else if (evt.type === "error") {
            throw new ClaudeError(evt.error?.message ?? "Streaming error from Anthropic API");
          }
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

interface SseEvent {
  type: string;
  delta?: { type?: string; text?: string };
  error?: { message?: string };
}

interface MessageResponse {
  content?: Array<{ type: string; text?: string }>;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function extractApiError(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    if (parsed.error?.message) return `Anthropic API ${status}: ${parsed.error.message}`;
  } catch {
    /* ignore */
  }
  if (status === 401) return "Anthropic API 401: invalid API key.";
  if (status === 429) return "Anthropic API 429: rate limited — slow down or check your plan.";
  return `Anthropic API error ${status}.`;
}
