import { providers } from "./providers";
import { getSettings, normalizeSettings, ExtensionSettings } from "../utils/storage";

const TEST_TIMEOUT_MS = 70000;

export interface TestConnectionResult {
  provider: string;
  model: string;
  ok: boolean;
  snippet: string;
}

export async function testConnection(overrides: Partial<ExtensionSettings> = {}): Promise<TestConnectionResult> {
  const stored = await getSettings();
  const settings = normalizeSettings({ ...stored, ...overrides });

  if (!settings.apiKey) {
    throw new Error("API key missing.");
  }
  if (!settings.model) {
    throw new Error("Model ID missing.");
  }
  if (settings.provider === "custom" && !settings.customBaseUrl) {
    throw new Error("Custom provider requires an API base URL.");
  }

  const provider = providers[settings.provider];
  if (!provider?.test) {
    throw new Error(`Provider "${settings.provider}" does not support connection tests.`);
  }

  console.log(
    `[Agentic] testConnection provider=${settings.provider} model=${settings.model}`
  );

  const result = await provider.test(settings, { timeoutMs: TEST_TIMEOUT_MS });
  return {
    provider: settings.provider,
    model: settings.model,
    ...result
  };
}
