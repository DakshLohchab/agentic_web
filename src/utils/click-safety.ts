export function getClickBlockReason(label: string | null, el: any): string | null {
  const text = (label || "").toLowerCase();
  const type = (el?.type || "").toLowerCase();

  // Explicit bypass for travel/hotel dates
  const isTravelDate = /\b(check-?out\s*date|check-?in)\b/i.test(text) || 
                       (/\bcheck-?out\b/i.test(text) && /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mon|tue|wed|thu|fri|sat|sun)\b/i.test(text)) ||
                       (el?.role === 'gridcell' && /\bcheck-?out\b/i.test(text));

  if (isTravelDate) return null;

  const payment =
    /\b(pay\s*now|checkout|purchase|buy\s+now|place\s+order|add\s+payment|credit\s*card|debit\s*card)\b/i.test(
      text
    ) || (type === "submit" && /\b(pay|purchase|checkout)\b/i.test(text));

  if (payment) {
    return "Payment or checkout control blocked. Use ask_user to confirm with the user first.";
  }

  return null;
}
