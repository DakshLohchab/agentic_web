import { Swarm } from "./agent/swarm";
import { MSG } from "./utils/messaging";
import { testConnection } from "./llm/test-connection";
import { getTabAccessInfo, prepareAgentTab } from "./utils/tab-access";
import { initNetworkTracker } from "./utils/network-tracker";
import { runBiWeeklyUpdater } from "./agent/updater";
import { mcpBridge } from "./utils/native-bridge";

export class TelemetryLogger {
  private static lastTransitionTime = Date.now();

  static async logTransition(state: any) {
    if (!state) return;
    const now = Date.now();
    const latencyMs = now - this.lastTransitionTime;
    this.lastTransitionTime = now;

    const trace = {
      timestamp: new Date().toISOString(),
      tabId: state.tabId,
      currentGoal: state.goal,
      actionTaken: state.lastAction || "none",
      latencyMs,
      criticResult: state.lastError || "ok"
    };

    mcpBridge.executeTool("log_agent_trace", trace).catch(err => {
      console.warn("Telemetry fire-and-forget failed:", err);
    });
  }
}

// Register active network trackers
initNetworkTracker();

// Run background caching scraper check on session start
runBiWeeklyUpdater().catch(err => console.error("Updater init failed:", err));

let keepAliveInterval: any = null;

function startTestKeepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  return setInterval(() => {
    // Platform info queries help extend the MV3 service worker lifespan
    chrome.runtime.getPlatformInfo?.(() => {});
  }, 20_000);
}

chrome.runtime.onInstalled.addListener(() => {
  // Set default side panel behavior to open on action button click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.alarms.create("swarm_keepalive", { periodInMinutes: 0.25 }).catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "swarm_keepalive") {
    console.log("[Agentic] keepalive");
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message, sendResponse).catch((err) => {
    console.error("[Agentic] handleMessage unhandled:", err);
    sendResponse({ ok: false, error: err?.message || String(err) });
  });
  return true; // Keep response channel open for async handlers
});

async function handleMessage(message: any, sendResponse: (response: any) => void) {
  const type = message?.type;

  try {
    switch (type) {
      case MSG.PING: {
        sendResponse({ ok: true, pong: true });
        return;
      }

      case MSG.START_AGENT: {
        const goal = (message.goal || "").trim();
        if (!goal) throw new Error("Enter a goal first.");

        let tabId = message.tabId ?? (await getActiveTabId());
        if (!tabId) throw new Error("No active tab context available.");

        const prep = await prepareAgentTab(tabId, goal, message.forceNewTab === true);
        if (!prep.ok) {
          sendResponse({
            ok: false,
            error: prep.message,
            accessDenied: true,
            state: { running: false, status: "error", step: 0 }
          });
          return;
        }

        tabId = prep.tabId!;
        await ensureContentScript(tabId);

        const state = await Swarm.spawnAgent(tabId, goal);
        sendResponse({
          ok: true,
          state,
          navigated: prep.navigated,
          url: prep.url
        });
        return;
      }

      case MSG.GET_STATUS: {
        sendResponse({ ok: true, swarm: Swarm.getSwarmState() });
        return;
      }

      case MSG.GET_TAB_ACCESS: {
        const tabId = message.tabId ?? (await getActiveTabId());
        if (!tabId) {
          sendResponse({ ok: true, access: getTabAccessInfo("", message.goal || "") });
          return;
        }
        const tab = await chrome.tabs.get(tabId);
        sendResponse({
          ok: true,
          access: getTabAccessInfo(tab.url, message.goal || "")
        });
        return;
      }

      case MSG.CAPTURE_VIEWPORT: {
        const tabId = message.tabId ?? (await getActiveTabId());
        if (!tabId) throw new Error("No active tab for capture");
        const dataUrl = await chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, { format: "png" });
        sendResponse({ ok: true, dataUrl });
        return;
      }

      case "DEBUGGER_CLICK": {
        const { tabId, x, y } = message;
        if (!tabId) throw new Error("No tabId for debugger click");
        
        await chrome.debugger.attach({ tabId }, "1.3");
        try {
          // Validate and adjust coordinates to account for visual viewport scaling (like mobile pinch zoom)
          let finalX = x;
          let finalY = y;
          try {
            const { result: metrics }: any = await chrome.debugger.sendCommand({ tabId }, "Page.getLayoutMetrics");
            if (metrics && metrics.visualViewport) {
              finalX = x * metrics.visualViewport.scale;
              finalY = y * metrics.visualViewport.scale;
            }
          } catch(e) {
             // Ignore if Page domain is not enabled or fails
          }

          await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
            type: "mousePressed",
            x: finalX,
            y: finalY,
            button: "left",
            clickCount: 1
          });
          await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x: finalX,
            y: finalY,
            button: "left",
            clickCount: 1
          });
        } finally {
          await chrome.debugger.detach({ tabId });
        }
        sendResponse({ ok: true });
        return;
      }

      case MSG.STOP_AGENT:
      case "STOP_AGENT": {
        if (message.tabId) {
          await Swarm.stopAgent(message.tabId);
        } else {
          await Swarm.stopAll();
        }
        sendResponse({ ok: true, swarm: Swarm.getSwarmState() });
        return;
      }

      case "USER_REPLY": {
        const { tabId, reply } = message;
        if (!tabId || !reply) throw new Error("Missing tabId or reply");
        
        const agent = Swarm.getAgent(tabId);
        if (agent) {
           agent.history.push({
             action: "user_reply",
             detail: `User said: ${reply}`,
             thought: "Received user input.",
             outcome: "ok"
           });
           agent.extractLearntRulesAsync(reply).catch(() => {});
           agent.start(tabId, agent.goal, true).catch(err => {
             console.error(`[Swarm] Agent error on tab ${tabId}:`, err);
           });
        } else {
           throw new Error("Agent not found for tabId");
        }
        sendResponse({ ok: true });
        return;
      }

      case MSG.TEST_LLM:
      case "TEST_LLM": {
        const keepAlive = startTestKeepAlive();
        try {
          console.log("[Agentic] TEST_LLM received", {
            provider: message.settings?.provider,
            model: message.settings?.model,
            hasKey: Boolean(message.settings?.apiKey)
          });

          const result = await testConnection(message.settings || {});

          console.log("[Agentic] TEST_LLM success", result.provider, result.model);

          sendResponse({
            ok: true,
            provider: result.provider,
            model: result.model,
            snippet: result.snippet,
            result: {
              snippet: result.snippet,
              model: result.model,
              provider: result.provider
            }
          });
        } catch (err: any) {
          console.error("[Agentic] TEST_LLM failed:", err);
          sendResponse({
            ok: false,
            error: err?.message || String(err)
          });
        } finally {
          clearInterval(keepAlive);
        }
        return;
      }

      default:
        sendResponse({ ok: false, error: `Unknown message type: ${type}` });
    }
  } catch (err: any) {
    console.error("[Agentic] handleMessage error:", err);
    sendResponse({ ok: false, error: err?.message || String(err) });
  }
}

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function ensureContentScript(tabId: number) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG.SNAPSHOT });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  }
}
