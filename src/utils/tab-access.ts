const RESTRICTED_PREFIXES = [
  "chrome:",
  "chrome-extension:",
  "edge:",
  "about:",
  "devtools:",
  "view-source:",
  "chrome-search:",
  "chrome-devtools:"
];

const WEBSTORE_RE = /chrome\.google\.com\/webstore/i;

const SITE_URLS: Record<string, string> = {
  youtube: "https://www.youtube.com",
  google: "https://www.google.com",
  github: "https://github.com",
  reddit: "https://www.reddit.com",
  amazon: "https://www.amazon.com",
  wikipedia: "https://www.wikipedia.org",
  stackoverflow: "https://stackoverflow.com",
  x: "https://x.com",
  twitter: "https://x.com",
  linkedin: "https://www.linkedin.com",
  netflix: "https://www.netflix.com",
  bing: "https://www.bing.com",
  duckduckgo: "https://duckduckgo.com"
};

export const RESTRICTED_TAB_MESSAGE =
  'Open a normal website first, or use a goal like "open youtube and …" — a new tab will open automatically.';

export function isRestrictedUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return true;
  const u = url.trim().toLowerCase();
  if (RESTRICTED_PREFIXES.some((p) => u.startsWith(p))) return true;
  if (WEBSTORE_RE.test(u)) return true;
  return false;
}

export function isScriptableUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.trim().toLowerCase();
  return (u.startsWith("http://") || u.startsWith("https://")) && !isRestrictedUrl(url);
}

function isNewTabPage(url: string | null | undefined): boolean {
  const u = (url || "").toLowerCase();
  return isRestrictedUrl(u) || u === "about:blank" || u.includes("chrome://newtab");
}

export function parseSiteFromGoal(goal: string | null | undefined): string | null {
  if (!goal?.trim()) return null;
  const g = goal.toLowerCase();

  const explicit = g.match(/https?:\/\/[^\s)'"]+/);
  if (explicit) return explicit[0].replace(/[.,;]+$/, "");

  const domain = g.match(/\b([a-z0-9][-a-z0-9]*\.(?:com|org|net|io|dev|co|edu))\b/);
  if (domain) {
    const host = domain[1];
    return host.startsWith("http") ? host : `https://${host.startsWith("www.") ? host : `www.${host}`}`;
  }

  for (const [name, url] of Object.entries(SITE_URLS)) {
    const openVerb = new RegExp(`\\b(open|go to|goto|visit|navigate to|browse|launch|run)\\s+${name}\\b`);
    const onSite = new RegExp(`\\bon ${name}\\b`);
    const bare = new RegExp(`\\b${name}\\b`);
    if (openVerb.test(g) || onSite.test(g)) return url;
    if (bare.test(g) && /\b(open|go|visit|navigate|find|search|watch|play|run)\b/.test(g)) return url;
  }

  if (/\b(video|watch|play)\b/.test(g) && /\b(best|find|run|open|asic|tutorial|how)\b/.test(g)) {
    return SITE_URLS.youtube;
  }

  return null;
}

export interface TabAccessInfo {
  restricted: boolean;
  scriptable: boolean;
  url: string;
  canAutoNavigate: boolean;
  suggestedUrl: string | null;
  message: string | null;
}

export function getTabAccessInfo(tabUrl: string | null | undefined, goal = ""): TabAccessInfo {
  const restricted = isRestrictedUrl(tabUrl) || isNewTabPage(tabUrl);
  const parsedUrl = parseSiteFromGoal(goal);
  
  // Smart fallback: if no specific site is parsed, but a goal is given, search Google for it
  const suggestedUrl = parsedUrl || (goal.trim() ? `https://www.google.com/search?q=${encodeURIComponent(goal.trim())}` : null);
  const canAutoNavigate = restricted && !!suggestedUrl;

  let message: string | null = null;
  if (restricted) {
    if (parsedUrl) {
      message = `Will open ${parsedUrl} in a new tab and run your goal there.`;
    } else if (suggestedUrl) {
      message = `Will search Google for "${goal.trim().slice(0, 40)}${goal.trim().length > 40 ? "..." : ""}" in a new tab.`;
    } else {
      message = RESTRICTED_TAB_MESSAGE;
    }
  }

  return {
    restricted,
    scriptable: isScriptableUrl(tabUrl),
    url: tabUrl || "",
    canAutoNavigate,
    suggestedUrl,
    message
  };
}

export function waitForTabLoad(tabId: number, timeoutMs = 20000): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (fn: (v: any) => void, value: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      fn(value);
    };

    const onUpdated = (id: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (id !== tabId) return;
      if (changeInfo.status === "complete" && isScriptableUrl(tab?.url)) {
        finish(resolve, tab);
      }
    };

    const timer = setTimeout(() => {
      finish(reject, new Error("Page took too long to load. Try again."));
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(onUpdated);

    chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === "complete" && isScriptableUrl(tab.url)) {
          finish(resolve, tab);
        }
      })
      .catch((err) => finish(reject, err));
  });
}

export interface PrepareTabResult {
  ok: boolean;
  message?: string;
  tabId?: number;
  navigated?: boolean;
  url?: string;
  created?: boolean;
}

export async function prepareAgentTab(tabId: number, goal: string, forceNewTab = false): Promise<PrepareTabResult> {
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return { ok: false, message: "No active tab found." };
  }

  let targetUrl = parseSiteFromGoal(goal);
  if (!targetUrl) {
    if (goal.trim()) {
      targetUrl = `https://www.google.com/search?q=${encodeURIComponent(goal.trim())}`;
    } else {
      targetUrl = "https://www.google.com";
    }
  }

  if (forceNewTab) {
    const created = await chrome.tabs.create({ url: targetUrl, active: true });
    if (created.id === undefined) {
      return { ok: false, message: "Failed to create tab." };
    }
    const loaded = await waitForTabLoad(created.id);
    return {
      ok: true,
      tabId: created.id,
      navigated: true,
      url: loaded.url || targetUrl,
      created: true
    };
  }

  if (isScriptableUrl(tab.url) && !isNewTabPage(tab.url)) {
    return { ok: true, tabId, navigated: false, url: tab.url, created: false };
  }

  const useNewTab = isNewTabPage(tab.url) || isRestrictedUrl(tab.url);

  if (useNewTab) {
    const created = await chrome.tabs.create({ url: targetUrl, active: true });
    if (created.id === undefined) {
      return { ok: false, message: "Failed to create tab." };
    }
    const loaded = await waitForTabLoad(created.id);
    return {
      ok: true,
      tabId: created.id,
      navigated: true,
      url: loaded.url || targetUrl,
      created: true
    };
  }

  await chrome.tabs.update(tabId, { url: targetUrl });
  const loaded = await waitForTabLoad(tabId);
  return {
    ok: true,
    tabId,
    navigated: true,
    url: loaded.url || targetUrl,
    created: false
  };
}
