export function getClickBlockReason(label: string | null, el: any): string | null {
  const text = (label || "").toLowerCase();
  const type = (el?.type || "").toLowerCase();

  const payment =
    /\b(pay\s*now|checkout|purchase|buy\s+now|place\s+order|add\s+payment|credit\s*card|debit\s*card)\b/i.test(
      text
    ) || (type === "submit" && /\b(pay|purchase|checkout)\b/i.test(text));

  if (payment) {
    return "Payment or checkout control blocked. Use ask_user to confirm with the user first.";
  }

  return null;
}
