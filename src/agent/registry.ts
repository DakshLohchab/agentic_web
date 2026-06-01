export interface SiteProfile {
  domain: string;
  name: string;
  selectors: Record<string, string>;
  rules: string[];
  anti_patterns: string[];
  api?: {
    search_url_template: string;
    response_path: string;
  };
}

const FALLBACK_SEED: SiteProfile[] = [
  {
    domain: "mail.google.com",
    name: "Gmail",
    selectors: {},
    rules: [
      "CRITICAL: The Subject line and Email Body are separate inputs. The main email body matches selector: div[role='textbox'][aria-label='Message Body'].",
      "You must explicitly CLICK the email body selector to shift focus before executing a 'type' action for the message content.",
      "Never type the greeting or email body content into the subject field. If text appears there incorrectly, clear it, click the body element, and re-type.",
      "To send, use the blue 'Send' button or press Ctrl+Enter."
    ],
    anti_patterns: []
  },
  {
    domain: "youtube.com",
    name: "YouTube",
    selectors: {},
    rules: [
      "Search via input[name='search_query'] (submit:true or press Enter).",
      "Results titles are standard links (a with #video-title). Click to watch.",
      "Skip ads if visible (button.ytp-ad-skip-button)."
    ],
    anti_patterns: []
  },
  {
    domain: "wikipedia.org",
    name: "Wikipedia",
    selectors: {},
    rules: [
      "Use search input[name='search'] to query topics directly.",
      "Scroll to read articles. Click blue hyperlinks to navigate topics."
    ],
    anti_patterns: [],
    api: {
      search_url_template: "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={{QUERY}}&format=json",
      response_path: "query.search"
    }
  },
  {
    domain: "google.com",
    name: "Google Search",
    selectors: {},
    rules: [
      "Submit queries with input[name='q'] and press Enter.",
      "Search results headers are standard links (a > h3). Click headers to visit sites."
    ],
    anti_patterns: []
  },
  {
    domain: "ticketmaster.com",
    name: "Event Ticketing",
    selectors: {},
    rules: [
      "Use search inputs to find events/matches by name/location directly.",
      "Choose event date, click 'Find Tickets' or 'Buy Tickets'.",
      "Select desired section/seats, select quantity, and proceed to checkout.",
      "Stop and trigger ask_user immediately upon reaching payment/credit card details screen."
    ],
    anti_patterns: []
  },
  {
    domain: "bookmyshow.com",
    name: "Event Ticketing",
    selectors: {},
    rules: [
      "Use search inputs to find events/matches by name/location directly.",
      "Choose event date, click 'Find Tickets' or 'Buy Tickets'.",
      "Select desired section/seats, select quantity, and proceed to checkout.",
      "Stop and trigger ask_user immediately upon reaching payment/credit card details screen."
    ],
    anti_patterns: []
  },
  {
    domain: "stubhub.com",
    name: "Event Ticketing",
    selectors: {},
    rules: [
      "Use search inputs to find events/matches by name/location directly.",
      "Choose event date, click 'Find Tickets' or 'Buy Tickets'.",
      "Select desired section/seats, select quantity, and proceed to checkout.",
      "Stop and trigger ask_user immediately upon reaching payment/credit card details screen."
    ],
    anti_patterns: []
  },
  {
    domain: "viagogo.com",
    name: "Event Ticketing",
    selectors: {},
    rules: [
      "Use search inputs to find events/matches by name/location directly.",
      "Choose event date, click 'Find Tickets' or 'Buy Tickets'.",
      "Select desired section/seats, select quantity, and proceed to checkout.",
      "Stop and trigger ask_user immediately upon reaching payment/credit card details screen."
    ],
    anti_patterns: []
  },
  {
    domain: "amazon.com",
    name: "Shopping & E-commerce",
    selectors: {},
    rules: [
      "Use search box to find products. Sort/filter via sidebars.",
      "Click product listings, select quantity/options, and click 'Add to Cart' or 'Add to Basket'.",
      "Stop and trigger ask_user before checkout or payment screens."
    ],
    anti_patterns: []
  },
  {
    domain: "ebay.com",
    name: "Shopping & E-commerce",
    selectors: {},
    rules: [
      "Use search box to find products. Sort/filter via sidebars.",
      "Click product listings, select quantity/options, and click 'Add to Cart' or 'Add to Basket'.",
      "Stop and trigger ask_user before checkout or payment screens."
    ],
    anti_patterns: []
  },
  {
    domain: "walmart.com",
    name: "Shopping & E-commerce",
    selectors: {},
    rules: [
      "Use search box to find products. Sort/filter via sidebars.",
      "Click product listings, select quantity/options, and click 'Add to Cart' or 'Add to Basket'.",
      "Stop and trigger ask_user before checkout or payment screens."
    ],
    anti_patterns: []
  }
];

class SiteRegistry {
  private cache: Map<string, SiteProfile> = new Map();

  private extractDomain(url: string): string | null {
    try {
      const parsedUrl = new URL(url);
      let hostname = parsedUrl.hostname;
      if (hostname.startsWith("www.")) {
        hostname = hostname.substring(4);
      }
      return hostname;
    } catch (error) {
      return null;
    }
  }

  async getProfileForUrl(url: string): Promise<SiteProfile | null> {
    const domain = this.extractDomain(url);
    if (!domain) return null;

    if (this.cache.has(domain)) {
      return this.cache.get(domain)!;
    }

    const storageKey = `site_profile_${domain}`;
    const result = await chrome.storage.local.get(storageKey);

    if (result[storageKey]) {
      const profile = result[storageKey] as SiteProfile;
      this.cache.set(domain, profile);
      return profile;
    }

    const fallback = FALLBACK_SEED.find(
      seed => domain === seed.domain || domain.endsWith("." + seed.domain)
    );

    if (fallback) {
      this.cache.set(domain, fallback);
      await chrome.storage.local.set({ [storageKey]: fallback });
      return fallback;
    }

    return null;
  }
}

export const siteRegistry = new SiteRegistry();
