// Pure (Obsidian-free) parsing of Anthropic streaming responses, extracted so
// it can be unit-tested without a browser/Electron runtime.

export interface SseEvent {
  type: string;
  delta?: { type?: string; text?: string };
  error?: { message?: string };
}

export interface SseParseResult {
  /** Concatenated text deltas found in the consumed lines. */
  text: string;
  /** The unconsumed trailing remainder (an incomplete final line). */
  remainder: string;
  /** Set if an `error` event was encountered. */
  error?: string;
}

/**
 * Consume whole lines from an SSE `buffer`, returning any text deltas and the
 * leftover partial line. Call repeatedly as chunks arrive, feeding the previous
 * `remainder` back in.
 */
export function parseSseChunk(buffer: string): SseParseResult {
  let text = "";
  let error: string | undefined;
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
      continue; // ignore malformed keep-alive/partial lines
    }
    if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
      text += evt.delta.text;
    } else if (evt.type === "error") {
      error = evt.error?.message ?? "Streaming error from Anthropic API";
    }
  }
  return { text, remainder: buffer, error };
}

/** Turn an Anthropic error response body + status into a readable message. */
export function extractApiError(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    if (parsed.error?.message) return `Anthropic API ${status}: ${parsed.error.message}`;
  } catch {
    /* not JSON */
  }
  if (status === 401) return "Anthropic API 401: invalid API key.";
  if (status === 429) return "Anthropic API 429: rate limited — slow down or check your plan.";
  return `Anthropic API error ${status}.`;
}
