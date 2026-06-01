import { isTabNetworkIdle } from "./network-tracker";

export async function waitForPageReady(tabId: number, maxMs = 500): Promise<void> {
  const start = Date.now();

  const domCheck = chrome.scripting.executeScript({
    target: { tabId },
    func: (timeoutMs) => {
      return new Promise<boolean>((resolve) => {
        let timeoutId: any;
        let observer: MutationObserver | null = null;
        let mutTimer: any = null;

        const finish = (res: boolean) => {
          if (timeoutId) clearTimeout(timeoutId);
          if (mutTimer) clearTimeout(mutTimer);
          if (observer) observer.disconnect();
          resolve(res);
        };

        timeoutId = setTimeout(() => finish(false), timeoutMs);

        const checkIdle = () => {
          if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(() => finish(true), { timeout: 50 });
          } else {
            setTimeout(() => finish(true), 50);
          }
        };

        const resetMutTimer = () => {
          if (mutTimer) clearTimeout(mutTimer);
          mutTimer = setTimeout(checkIdle, 100);
        };

        observer = new MutationObserver(resetMutTimer);
        observer.observe(document.documentElement, {
          childList: true, subtree: true, attributes: true, characterData: true
        });

        resetMutTimer();
      });
    },
    args: [maxMs]
  }).catch(() => [{ result: false }]);

  const networkCheck = new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (Date.now() - start >= maxMs || isTabNetworkIdle(tabId)) {
        clearInterval(timer);
        resolve();
      }
    }, 20);
  });

  await Promise.all([domCheck, networkCheck]);
}
