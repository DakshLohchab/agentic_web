/**
 * @deprecated Use SiteProfile from './registry' instead.
 */
interface DomainKnowledge {
  match: RegExp | string;
  name: string;
  rules: string[];
}

/**
 * @deprecated Use siteRegistry from './registry' instead.
 */
const KNOWLEDGE_DICT: DomainKnowledge[] = [
  {
    match: /mail\.google\.com/i,
    name: "Gmail",
    rules: [
      "CRITICAL: The Subject line and Email Body are separate inputs. The main email body matches selector: div[role='textbox'][aria-label='Message Body'].",
      "You must explicitly CLICK the email body selector to shift focus before executing a 'type' action for the message content.",
      "Never type the greeting or email body content into the subject field. If text appears there incorrectly, clear it, click the body element, and re-type.",
      "To send, use the blue 'Send' button or press Ctrl+Enter."
    ]
  },
  {
    match: /youtube\.com/i,
    name: "YouTube",
    rules: [
      "Search via input[name='search_query'] (submit:true or press Enter).",
      "Results titles are standard links (a with #video-title). Click to watch.",
      "Skip ads if visible (button.ytp-ad-skip-button)."
    ]
  },
  {
    match: /wikipedia\.org/i,
    name: "Wikipedia",
    rules: [
      "Use search input[name='search'] to query topics directly.",
      "Scroll to read articles. Click blue hyperlinks to navigate topics."
    ]
  },
  {
    match: /google\.com\/search/i,
    name: "Google Search",
    rules: [
      "Submit queries with input[name='q'] and press Enter.",
      "Search results headers are standard links (a > h3). Click headers to visit sites."
    ]
  },
  {
    match: /ticketmaster\.com|bookmyshow\.com|stubhub\.com|viagogo/i,
    name: "Event Ticketing",
    rules: [
      "Use search inputs to find events/matches by name/location directly.",
      "Choose event date, click 'Find Tickets' or 'Buy Tickets'.",
      "Select desired section/seats, select quantity, and proceed to checkout.",
      "Stop and trigger ask_user immediately upon reaching payment/credit card details screen."
    ]
  },
  {
    match: /amazon\.com|ebay\.com|walmart\.com/i,
    name: "Shopping & E-commerce",
    rules: [
      "Use search box to find products. Sort/filter via sidebars.",
      "Click product listings, select quantity/options, and click 'Add to Cart' or 'Add to Basket'.",
      "Stop and trigger ask_user before checkout or payment screens."
    ]
  }
];

/**
 * @deprecated Use siteRegistry.getProfileForUrl() from './registry' instead.
 */
export function getRulesForUrl(url: string | null | undefined): string {
  if (!url) return "";
  const match = KNOWLEDGE_DICT.find((k) => {
    if (k.match instanceof RegExp) return k.match.test(url);
    return url.toLowerCase().includes(k.match.toLowerCase());
  });

  if (match) {
    return `\n=== Dynamic Web Rules [${match.name}] ===\n${match.rules.map((r) => `- ${r}`).join("\n")}\n`;
  }
  return "";
}
