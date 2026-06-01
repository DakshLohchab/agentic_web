export async function errorFromResponse(res: Response, model: string, providerLabel = "API"): Promise<string> {
  let bodyText = "";
  let parsed: any = null;
  try {
    bodyText = await res.text();
    parsed = JSON.parse(bodyText);
  } catch {
    /* plain text body */
  }

  const apiMsg =
    parsed?.error?.message ||
    parsed?.error?.metadata?.raw ||
    (typeof parsed?.error === "string" ? parsed.error : null) ||
    parsed?.message ||
    bodyText.slice(0, 400);

  const modelHint = formatModelHint(res.status, model, apiMsg);

  if (res.status === 401) {
    return `Authentication failed (401). Check your API key. ${apiMsg || ""}`.trim();
  }
  if (res.status === 403) {
    return `Access denied (403). ${apiMsg || "Key may lack permission for this model."}`.trim();
  }
  if (res.status === 404 || isModelNotFound(res.status, apiMsg)) {
    return `Model not found (${res.status}) for "${model}". ${modelHint} ${apiMsg || ""}`.trim();
  }
  if (res.status === 429) {
    return `Rate limited (429). Wait and retry. ${apiMsg || ""}`.trim();
  }
  if (res.status >= 500) {
    return `${providerLabel} server error (${res.status}). Try again later. ${apiMsg || ""}`.trim();
  }
  return `${providerLabel} HTTP ${res.status}: ${apiMsg || bodyText.slice(0, 200)}`.trim();
}

function isModelNotFound(status: number, msg: any): boolean {
  if (status === 400 && msg && /model/i.test(String(msg))) return true;
  return false;
}

function formatModelHint(status: number, model: string, apiMsg: any): string {
  const parts = [];
  if (model && /[:;,.]$/.test(model)) {
    parts.push('Your model ID has trailing punctuation — remove the trailing ":" and save again.');
  }
  if (model && /nemotron/i.test(model)) {
    parts.push(
      "Verify the exact slug at openrouter.ai/models (e.g. nvidia/nemotron-nano-9b-v2 — names change)."
    );
  }
  if (status === 404) {
    parts.push("Copy the model id exactly from OpenRouter’s model page.");
  }
  if (apiMsg && /does not exist|not found|invalid model/i.test(String(apiMsg))) {
    parts.push("The provider rejected this model id.");
  }
  return parts.join(" ");
}
