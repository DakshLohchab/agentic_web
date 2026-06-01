import { errorFromResponse } from "./api-errors";
import { ExtensionSettings } from "../utils/storage";

function extractJson(text: string): any {
  const trimmed = (text || "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in LLM response");
  return JSON.parse(raw.slice(start, end + 1));
}

function makeTimeout(timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
    timeoutMs
  };
}

function timeoutError(ms: number, providerLabel: string): Error {
  return new Error(
    `Request to ${providerLabel} timed out after ${Math.round(ms / 1000)}s. Reasoning models can be slow — try again, pick a faster model, or check openrouter.ai status.`
  );
}

async function openAiCompatibleTest(
  url: string,
  apiKey: string,
  model: string,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 70000,
  providerLabel = "API"
): Promise<{ ok: boolean; snippet: string }> {
  const { signal, clear, timeoutMs: ms } = makeTimeout(timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 5,
        temperature: 0
      })
    });
    clear();
  } catch (err: any) {
    clear();
    if (err.name === "AbortError") throw timeoutError(ms, providerLabel);
    throw new Error(`Network error: ${err.message || err}`);
  }

  if (!res.ok) {
    throw new Error(await errorFromResponse(res, model, providerLabel));
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() || "";
  return {
    ok: true,
    snippet: content.slice(0, 80) || "(empty text, but API responded)"
  };
}

async function openAiCompatibleChat(
  url: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 60000,
  imageBase64: string | null = null
): Promise<any> {
  const { signal, clear, timeoutMs: ms } = makeTimeout(timeoutMs);

  const userContent = imageBase64 
    ? [
        { type: "text", text: userMessage },
        { type: "image_url", image_url: { url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/png;base64,${imageBase64}` } }
      ]
    : userMessage;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        temperature: 0.2,
        max_tokens: 1024
      })
    });
    clear();
  } catch (err: any) {
    clear();
    if (err.name === "AbortError") throw timeoutError(ms, "LLM");
    throw new Error(`Network error: ${err.message || err}`);
  }

  if (!res.ok) {
    throw new Error(await errorFromResponse(res, model, "LLM"));
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from LLM");
  return extractJson(content);
}

const OPENROUTER_HEADERS = {
  "HTTP-Referer": "https://github.com/agentic-browser-extension",
  "X-Title": "Agentic Browser Extension"
};

export interface LLMProvider {
  label: string;
  defaultModel: string;
  test(settings: ExtensionSettings, options?: { timeoutMs?: number }): Promise<{ ok: boolean; snippet: string }>;
  chat(settings: ExtensionSettings, systemPrompt: string, userMessage: string, imageBase64?: string | null): Promise<any>;
}

export const providers: Record<string, LLMProvider> = {
  openrouter: {
    label: "OpenRouter",
    defaultModel: "anthropic/claude-3.5-sonnet",
    async test(settings, { timeoutMs } = {}) {
      return openAiCompatibleTest(
        "https://openrouter.ai/api/v1/chat/completions",
        settings.apiKey,
        settings.model,
        OPENROUTER_HEADERS,
        timeoutMs,
        "OpenRouter"
      );
    },
    async chat(settings, systemPrompt, userMessage, imageBase64 = null) {
      return openAiCompatibleChat(
        "https://openrouter.ai/api/v1/chat/completions",
        settings.apiKey,
        settings.model,
        systemPrompt,
        userMessage,
        OPENROUTER_HEADERS,
        60000,
        imageBase64
      );
    }
  },

  openai: {
    label: "OpenAI",
    defaultModel: "gpt-4o",
    async test(settings, { timeoutMs } = {}) {
      return openAiCompatibleTest(
        "https://api.openai.com/v1/chat/completions",
        settings.apiKey,
        settings.model,
        {},
        timeoutMs,
        "OpenAI"
      );
    },
    async chat(settings, systemPrompt, userMessage, imageBase64 = null) {
      return openAiCompatibleChat(
        "https://api.openai.com/v1/chat/completions",
        settings.apiKey,
        settings.model,
        systemPrompt,
        userMessage,
        {},
        60000,
        imageBase64
      );
    }
  },

  anthropic: {
    label: "Anthropic",
    defaultModel: "claude-3-5-sonnet-20241022",
    async test(settings, { timeoutMs } = {}) {
      const { signal, clear, timeoutMs: ms } = makeTimeout(timeoutMs ?? 70000);
      let res: Response;
      try {
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            "x-api-key": settings.apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: settings.model,
            max_tokens: 5,
            messages: [{ role: "user", content: "Reply with exactly: OK" }]
          })
        });
        clear();
      } catch (err: any) {
        clear();
        if (err.name === "AbortError") throw timeoutError(ms, "Anthropic");
        throw new Error(`Network error: ${err.message || err}`);
      }
      if (!res.ok) throw new Error(await errorFromResponse(res, settings.model, "Anthropic"));
      const data = await res.json();
      const text = data.content?.find((c: any) => c.type === "text")?.text?.trim() || "";
      return { ok: true, snippet: text.slice(0, 80) || "(empty)" };
    },
    async chat(settings, systemPrompt, userMessage, imageBase64 = null) {
      const { signal, clear, timeoutMs: ms } = makeTimeout(60000);
      
      const userContent = imageBase64
        ? [
            { type: "text", text: userMessage },
            { 
              type: "image", 
              source: { 
                type: "base64", 
                media_type: "image/png", 
                data: imageBase64.replace(/^data:image\/\w+;base64,/, "") 
              } 
            }
          ]
        : userMessage;

      let res: Response;
      try {
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            "x-api-key": settings.apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: settings.model,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: "user", content: userContent }]
          })
        });
        clear();
      } catch (err: any) {
        clear();
        if (err.name === "AbortError") throw timeoutError(ms, "Anthropic");
        throw err;
      }
      if (!res.ok) throw new Error(await errorFromResponse(res, settings.model, "Anthropic"));
      const data = await res.json();
      const block = data.content?.find((c: any) => c.type === "text");
      if (!block?.text) throw new Error("Empty Anthropic response");
      return extractJson(block.text);
    }
  },

  gemini: {
    label: "Google Gemini",
    defaultModel: "gemini-2.0-flash",
    async test(settings, { timeoutMs } = {}) {
      const model = settings.model || "gemini-2.0-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
      const { signal, clear, timeoutMs: ms } = makeTimeout(timeoutMs ?? 70000);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Reply with exactly: OK" }] }],
            generationConfig: { maxOutputTokens: 5, temperature: 0 }
          })
        });
        clear();
      } catch (err: any) {
        clear();
        if (err.name === "AbortError") throw timeoutError(ms, "Gemini");
        throw new Error(`Network error: ${err.message || err}`);
      }
      if (!res.ok) throw new Error(await errorFromResponse(res, model, "Gemini"));
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("").trim() || "";
      return { ok: true, snippet: text.slice(0, 80) || "(empty)" };
    },
    async chat(settings, systemPrompt, userMessage, imageBase64 = null) {
      const model = settings.model || "gemini-2.0-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
      const { signal, clear, timeoutMs: ms } = makeTimeout(60000);

      const userParts: any[] = [{ text: userMessage }];
      if (imageBase64) {
        userParts.push({
          inline_data: {
            mime_type: "image/png",
            data: imageBase64.replace(/^data:image\/\w+;base64,/, "")
          }
        });
      }

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: userParts }],
            generationConfig: { temperature: 0.2 }
          })
        });
        clear();
      } catch (err: any) {
        clear();
        if (err.name === "AbortError") throw timeoutError(ms, "Gemini");
        throw err;
      }
      if (!res.ok) throw new Error(await errorFromResponse(res, model, "Gemini"));
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
      if (!text) throw new Error("Empty Gemini response");
      return extractJson(text);
    }
  },

  custom: {
    label: "Custom (OpenAI-compatible)",
    defaultModel: "",
    async test(settings, { timeoutMs } = {}) {
      const base = (settings.customBaseUrl || "").replace(/\/$/, "");
      if (!base) throw new Error("Custom base URL is required");
      const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
      return openAiCompatibleTest(url, settings.apiKey, settings.model, {}, timeoutMs, "Custom API");
    },
    async chat(settings, systemPrompt, userMessage, imageBase64 = null) {
      const base = (settings.customBaseUrl || "").replace(/\/$/, "");
      if (!base) throw new Error("Custom base URL is required");
      const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
      return openAiCompatibleChat(url, settings.apiKey, settings.model, systemPrompt, userMessage, {}, 60000, imageBase64);
    }
  }
};

export function listProviders() {
  return Object.entries(providers).map(([id, p]) => ({
    id,
    label: p.label,
    defaultModel: p.defaultModel
  }));
}
