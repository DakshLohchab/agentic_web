const activeRequests = new Map<number, Set<string>>();

export function initNetworkTracker() {
  if (typeof chrome === "undefined" || !chrome.webRequest) return;

  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      // Ignore background or invalid tabs
      if (details.tabId <= 0) return;
      let reqs = activeRequests.get(details.tabId);
      if (!reqs) {
        reqs = new Set();
        activeRequests.set(details.tabId, reqs);
      }
      reqs.add(details.requestId);
    },
    { urls: ["<all_urls>"] }
  );

  const removeRequest = (details: any) => {
    if (details.tabId <= 0) return;
    const reqs = activeRequests.get(details.tabId);
    if (reqs) {
      reqs.delete(details.requestId);
      if (reqs.size === 0) {
        activeRequests.delete(details.tabId);
      }
    }
  };

  chrome.webRequest.onCompleted.addListener(removeRequest, { urls: ["<all_urls>"] });
  chrome.webRequest.onErrorOccurred.addListener(removeRequest, { urls: ["<all_urls>"] });
}

export function isTabNetworkIdle(tabId: number): boolean {
  const reqs = activeRequests.get(tabId);
  return !reqs || reqs.size === 0;
}

export function waitForNetworkIdle(tabId: number, idleMs = 80, timeoutMs = 500): Promise<void> {
  return new Promise((resolve) => {
    let idleStart = Date.now();
    let timer: any;
    const start = Date.now();

    const check = () => {
      const now = Date.now();
      if (now - start >= timeoutMs) {
        clearInterval(timer);
        resolve(); // Timed out, force continue
        return;
      }

      if (isTabNetworkIdle(tabId)) {
        if (now - idleStart >= idleMs) {
          clearInterval(timer);
          resolve();
        }
      } else {
        idleStart = now; // reset idle start
      }
    };

    timer = setInterval(check, 30);
  });
}
