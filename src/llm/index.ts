import { providers } from "./providers";
import { getSettings } from "../utils/storage";

export async function callLLM(systemPrompt: string, userMessage: string, imageBase64: string | null = null): Promise<any> {
  const settings = await getSettings();
  if (!settings.apiKey) {
    throw new Error("API key not configured. Open extension options and add your key.");
  }
  const provider = providers[settings.provider];
  if (!provider) throw new Error(`Unknown provider: ${settings.provider}`);
  return provider.chat(settings, systemPrompt, userMessage, imageBase64);
}

export { testConnection } from "./test-connection";
export { listProviders } from "./providers";
