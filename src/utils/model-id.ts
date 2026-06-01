export function sanitizeModelId(model: string | null | undefined): string {
  if (model == null) return "";
  let m = String(model).trim();
  m = m.replace(/^["'`]+|["'`]+$/g, "");
  m = m.replace(/[:;,.]+$/g, "").trim();
  return m;
}

export function validateModelId(model: string | null | undefined): { valid: boolean; warning: string | null } {
  const raw = (model || "").trim();
  if (!raw) {
    return { valid: false, warning: "Model ID is required." };
  }
  if (/[:;,.]$/.test(raw)) {
    return {
      valid: false,
      warning: 'Remove trailing punctuation from the model ID (e.g. a stray ":" at the end).'
    };
  }
  if (/[\s'"<>]/.test(raw)) {
    return { valid: false, warning: "Model ID should not contain spaces or quotes." };
  }
  if (!/^[\w./+-]+$/.test(raw)) {
    return {
      valid: false,
      warning: "Unusual characters in model ID — use only letters, numbers, /, -, ., +"
    };
  }
  return { valid: true, warning: null };
}
