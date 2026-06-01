export const MSG = {
  START_AGENT: "START_AGENT",
  STOP_AGENT: "STOP_AGENT",
  GET_STATUS: "GET_STATUS",
  GET_TAB_ACCESS: "GET_TAB_ACCESS",
  TEST_LLM: "TEST_LLM",
  PING: "PING",
  SNAPSHOT: "SNAPSHOT",
  EXECUTE_ACTION: "EXECUTE_ACTION",
  AGENT_UPDATE: "AGENT_UPDATE",
  AGENT_OVERLAY: "AGENT_OVERLAY",
  CAPTURE_VIEWPORT: "CAPTURE_VIEWPORT"
} as const;

export function sendToTab(tabId: number, message: any): Promise<any> {
  return chrome.tabs.sendMessage(tabId, message);
}

export function broadcastUpdate(payload: any): void {
  chrome.runtime.sendMessage({ type: MSG.AGENT_UPDATE, ...payload }).catch(() => {});
}

export async function updateTabOverlay(tabId: number | null, payload: any): Promise<void> {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG.AGENT_OVERLAY, ...payload });
  } catch {
    /* tab may be loading */
  }
}

export function sendBackgroundMessage(payload: any, timeoutMs = 85000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `No response after ${Math.round(timeoutMs / 1000)}s. Reload the extension at chrome://extensions, then try again.`
        )
      );
    }, timeoutMs);

    try {
      chrome.runtime.sendMessage(payload, (response) => {
        clearTimeout(timer);
        const err = chrome.runtime.lastError;
        if (err) {
          const msg = err.message || String(err);
          if (/receiving end does not exist|could not establish connection/i.test(msg)) {
            reject(
              new Error(
                "Background not responding — reload the extension at chrome://extensions (service worker may be stopped)."
              )
            );
          } else {
            reject(new Error(msg));
          }
          return;
        }
        if (response === undefined) {
          reject(
            new Error(
              "Background returned no response — reload the extension. Check the service worker errors on chrome://extensions."
            )
          );
          return;
        }
        resolve(response);
      });
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}
