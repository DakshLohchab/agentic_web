import { sanitizeModelId } from "./model-id";

export interface ExtensionSettings {
  provider: string;
  apiKey: string;
  model: string;
  customBaseUrl: string;
}

const DEFAULTS: ExtensionSettings = {
  provider: "openrouter",
  apiKey: "",
  model: "anthropic/claude-3.5-sonnet",
  customBaseUrl: ""
};

export function normalizeSettings(settings: Partial<ExtensionSettings>): ExtensionSettings {
  return {
    provider: settings.provider ?? DEFAULTS.provider,
    apiKey: (settings.apiKey ?? "").trim(),
    model: sanitizeModelId(settings.model ?? ""),
    customBaseUrl: (settings.customBaseUrl ?? "").trim().replace(/\/$/, "")
  };
}

export async function getSettings(): Promise<ExtensionSettings> {
  const keys = Object.keys(DEFAULTS);
  const data = await chrome.storage.sync.get(keys);
  return normalizeSettings({ ...DEFAULTS, ...data });
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const payload = normalizeSettings(settings);
  await chrome.storage.sync.set(payload);
  return payload;
}
