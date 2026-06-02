import { SYSTEM_PROMPT, buildUserMessage } from "./system-prompt";
import { ExperienceStore, Experience } from "./experience";
import { callLLM } from "../llm/index";
import { MSG, sendToTab, broadcastUpdate, updateTabOverlay } from "../utils/messaging";
import { waitForTabLoad } from "../utils/tab-access";
import { getHeuristicHint, shouldRunAutoAction } from "./heuristics";
import { waitForNetworkIdle } from "../utils/network-tracker";
import { waitForPageReady } from "../utils/page-ready";
import { siteRegistry } from "./registry";
import { StateGraph, AgentState } from "./graph";
import { generateSemanticTree } from "../utils/semantic-parser";
import { detectAndClearOverlays } from "../utils/overlay-nuker";
import { mcpBridge } from "../utils/native-bridge";
import { speedRenderer } from "../utils/net-blocker";

function fuzzyMatchElement(hint: string, interactables: any[]) {
  if (!hint) return null;
  const needle = hint.toLowerCase();
  let match = interactables.find(i => i.id === needle);
  if (match) return match.id;
  let bestId = null;
  let bestScore = 0;
  for (const item of interactables) {
    const hay = `${item.text} ${item.placeholder} ${item.role} ${item.tag}`.toLowerCase();
    if (hay === needle) return item.id;
    if (hay.includes(needle)) {
      if (50 > bestScore) { bestScore = 50; bestId = item.id; }
    } else if (needle.split(/\\s+/).every(w => hay.includes(w))) {
      if (25 > bestScore) { bestScore = 25; bestId = item.id; }
    }
  }
  return bestId;
}

const MAX_RETRIES = 3;
const MAX_STEPS = 30;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatActionDetail(action: any): string {
  const parts = [action.action];
  if (action.elementId) parts.push(`@${action.elementId}`);
  if (action.value) parts.push(`"${String(action.value).slice(0, 40)}"`);
  if (action.url) parts.push(action.url);
  if (action.submit) parts.push("submit");
  return parts.join(" ");
}

export class AgentLoop {
  running = false;
  tabId: number | null = null;
  goal = "";
  history: Array<{ action: string; detail: string; thought: string; outcome: string }> = [];
  step = 0;
  retryCount = 0;
  status = "idle";
  lastThought = "";
  lastAction = "";
  lastError = "";
  globalPlan: string[] = [];
  currentStepIndex = 0;
  actionHistory: string[] = [];
  memory: Record<string, any>;
  lastActionRect: {x: number, y: number, w: number, h: number} | null = null;
  forceFullSnapshot = false;
  plannedSteps: any[] = [];
  planConfidence = 0;
  hasGroundingImage = false;
  groundingImage: string | null = null;
  verifyAttempts = 0;
  timeoutCount = 0;
  pastExperience: Experience | null = null;

  constructor(sharedMemory: Record<string, any> = {}) {
    this.memory = sharedMemory;
  }

  getState() {
    return {
      tabId: this.tabId,
      running: this.running,
      status: this.status,
      step: this.step,
      goal: this.goal,
      lastThought: this.lastThought,
      lastAction: this.lastAction,
      lastError: this.lastError,
      historyLength: this.history.length,
      global_plan: this.globalPlan,
      current_step_index: this.currentStepIndex
    };
  }

  async pushUpdate(extra = {}) {
    const state = this.getState();
    broadcastUpdate({ state, ...extra });
    await updateTabOverlay(this.tabId, {
      status: state.status,
      step: state.step,
      lastAction: state.lastAction,
      lastThought: state.lastThought,
      running: state.running
    });
  }



  async start(tabId: number, goal: string, isResume = false) {
    this.tabId = tabId;
    if (!isResume) {
      this.goal = goal;
      this.history = [];
      this.step = 0;
      this.retryCount = 0;
      this.lastError = "";
      this.lastAction = "";
      this.globalPlan = [];
      this.currentStepIndex = 0;
      this.actionHistory = [];
      this.lastActionRect = null;
      this.forceFullSnapshot = false;
      this.plannedSteps = [];
      this.planConfidence = 0;
      this.hasGroundingImage = false;
      this.groundingImage = null;
      this.verifyAttempts = 0;
      this.timeoutCount = 0;
      this.pastExperience = await ExperienceStore.findSimilarExperience(goal);
    }
    this.running = true;
    this.status = "running";
    await speedRenderer.enable(tabId);
    await this.pushUpdate();

    // Initialize State Graph
    const graph = new StateGraph();

    // 1. Observer Node: Gathers tab information and stabilization
    graph.addNode("observer", async (state) => {
      this.status = "observing";
      await this.pushUpdate();

      // Wait for network requests to settle (Max 1.5s, idle for 150ms)
      await waitForNetworkIdle(tabId, 80, 500);

      try {
        await sendToTab(tabId, { type: "WAIT_FOR_STABILIZATION", timeout: 800, stabilityMs: 80 });
      } catch (e) {
        console.warn("Stabilization wait failed", e);
      }

      let historyUpdates = [...state.history];
      try {
        const nukerResult = await detectAndClearOverlays(tabId);
        if (nukerResult?.cleared) {
          historyUpdates.push({
            thought: "System automatically removed blocking overlays before capturing snapshot.",
            action: "system_nuke_overlay",
            detail: "Auto-cleared popups/modals",
            outcome: `Cleared: ${nukerResult.details.join(" | ")}`
          });
        }
      } catch (e) {
        // Silently ignore script injection failures
      }

      let snapshotType = (this.step === 0 || this.forceFullSnapshot) ? MSG.SNAPSHOT : "SNAPSHOT_DIFF";
      let snapshot = await sendToTab(tabId, { type: snapshotType, lastActionRect: this.lastActionRect });

      if (snapshot?.ok && snapshot.isDiff && snapshot.interactables && snapshot.interactables.length < 5) {
        this.forceFullSnapshot = true;
        snapshot = await sendToTab(tabId, { type: MSG.SNAPSHOT });
      }

      if (snapshot?.ok && (!snapshot.interactables || snapshot.interactables.length === 0)) {
        await waitForPageReady(tabId, 300);
        const retrySnap = await sendToTab(tabId, { type: snapshotType, lastActionRect: this.lastActionRect });
        if (retrySnap?.ok) snapshot = retrySnap;
      }
      
      this.forceFullSnapshot = false;

      if (!snapshot?.ok) throw new Error(snapshot?.error || "Failed to parse layout snapshot.");

      if (state.step === 0 || !this.hasGroundingImage) {
        try {
          const capRes = await chrome.runtime.sendMessage({ type: MSG.CAPTURE_VIEWPORT, tabId });
          if (capRes?.ok) {
            this.groundingImage = capRes.dataUrl;
            this.hasGroundingImage = true;
          }
        } catch (e) {
          console.warn("Viewport capture failed", e);
        }
      }

      snapshot.semanticTree = generateSemanticTree(snapshot.interactables);



      return { snapshot, history: historyUpdates };
    });

    // 2. Planner Node: Decides plan updates and next action via heuristics or LLM
    graph.addNode("planner", async (state) => {
      this.status = "thinking";
      await this.pushUpdate();

      const { hint, autoAction } = getHeuristicHint(state.snapshot, state.goal, state.history);

      if (shouldRunAutoAction(autoAction, state.history)) {
        return {
          nextAction: autoAction,
          lastThought: "(auto) " + (hint || "")
        };
      }

      if (this.plannedSteps && this.plannedSteps.length > 0 && this.planConfidence > 0.7 && this.currentStepIndex < this.plannedSteps.length) {
        const stepPlan = this.plannedSteps[this.currentStepIndex];
        let canExecute = true;

        if (stepPlan.condition) {
          const c = stepPlan.condition.toLowerCase();
          if (c.includes("url contains")) {
            const term = (c.split("url contains")[1] || "").trim().replace(/['"]/g, "");
            if (!state.snapshot.url.toLowerCase().includes(term)) canExecute = false;
          } else if (c.includes("element") && c.includes("exists")) {
            const term = c.replace(/.*element (?:matching )?['"]?([^'"]+)['"]? exists.*/, "$1").trim();
            if (!fuzzyMatchElement(term, state.snapshot.interactables)) canExecute = false;
          } else {
            canExecute = false;
          }
        }

        let elementId = null;
        if (canExecute && stepPlan.elementHint) {
          elementId = fuzzyMatchElement(stepPlan.elementHint, state.snapshot.interactables);
          if (!elementId && !["scroll", "navigate", "wait", "done", "synthesize", "ask_user", "delegate"].includes(stepPlan.action)) {
            canExecute = false;
          }
        }

        if (canExecute) {
          console.log(`[Agentic] Executing pre-planned step ${this.currentStepIndex}: ${stepPlan.action}`);
          return {
            nextAction: {
              action: stepPlan.action,
              elementId: elementId,
              value: stepPlan.value,
              url: stepPlan.url,
              thought: `[Plan step ${this.currentStepIndex}] ${stepPlan.action} ${stepPlan.elementHint || ""}`
            },
            lastThought: `[Plan step ${this.currentStepIndex}] ${stepPlan.action}`,
            actionHistory: [...state.actionHistory, `${stepPlan.action}-${elementId}-${stepPlan.value}`]
          };
        }
      }

      let imageBase64: string | null = null;
      if (state.step === 0 && this.hasGroundingImage) {
        imageBase64 = this.groundingImage;
      }

      let siteProfile = null;
      try {
        siteProfile = await siteRegistry.getProfileForUrl(state.snapshot.url);
      } catch (e) {
        console.warn("Failed to fetch dynamic site profile", e);
      }
      const userMessage = buildUserMessage(state.goal, state.snapshot, state.history, state.retryCount, hint, siteProfile, this.memory, this.pastExperience);
      
      let obstructionHint = "";
      if (state.retryCount > 0 && state.lastError) {
        obstructionHint = "\n[SYSTEM FLAG] The last action failed. A layout obstruction is highly likely. You may want to choose alternative element interaction routes or emit the 'clear_obstacle' action to forcibly remove visual blockers.\n";
      }

      const stateContext = `
Current State:
${JSON.stringify({
  global_plan: state.globalPlan,
  current_step_index: state.currentStepIndex,
  last_successful_action: state.history[state.history.length - 1]?.detail || "None"
}, null, 2)}
`;
      let fullUserMessage = userMessage + stateContext + obstructionHint;
      if (state.step === 0 && imageBase64) {
        fullUserMessage += "\nScreenshot attached for spatial layout reference. Use it to understand element positions and visual groupings that may not be obvious from the DOM alone.\n";
      }

      // Truncate context if we are in a timeout recovery state
      if (this.timeoutCount > 0) {
         fullUserMessage = fullUserMessage.substring(0, 15000) + "\n...[TRUNCATED DUE TO TIMEOUT]";
      }

      let action: any;
      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("LLM_TIMEOUT")), 45000));
        action = await Promise.race([
          callLLM(SYSTEM_PROMPT, fullUserMessage, imageBase64),
          timeoutPromise
        ]);
        this.timeoutCount = 0; // Reset on success
      } catch (err: any) {
        if (err.message === "LLM_TIMEOUT") {
          this.timeoutCount++;
          if (this.timeoutCount >= 2) {
            this.status = "error";
            this.lastError = "Agent stalled: LLM inference timed out twice sequentially. Aborting to prevent infinite hang.";
            this.running = false;
            await this.pushUpdate();
            return {
               nextAction: { action: "done", thought: "Forced abort due to timeout." },
               lastThought: "Aborted.",
               actionHistory: []
            };
          } else {
            console.warn("[Agentic Circuit Breaker] LLM Timeout. Forcing recovery cycle.");
            state.history.push({
              action: "timeout_recovery",
              detail: "LLM execution exceeded 45s. Forcing context truncation.",
              thought: "The context window may be overloaded. Truncating semantic tree for retry.",
              outcome: "Triggered recovery."
            });
            return {
               nextAction: { action: "wait", value: 1, thought: "Timeout recovery cycle initiated." },
               lastThought: "Timeout recovery.",
               actionHistory: []
            };
          }
        }
        throw err;
      }

      if (!action) {
        throw new Error("LLM returned an invalid or empty action payload.");
      }

      const actionHash = `${action.action}-${action.elementId}-${action.value}`;
      const newActionHistory = [...state.actionHistory, actionHash];
      
      let consecutiveScrolls = 0;
      for (let i = newActionHistory.length - 1; i >= 0; i--) {
        if (newActionHistory[i].startsWith("scroll-")) {
          consecutiveScrolls++;
        } else {
          break;
        }
      }

      if (consecutiveScrolls > 2) {
        this.status = "ask_user";
        this.lastError = "I have scrolled multiple times but cannot find the target element. Please help or provide more specific instructions.";
        this.running = false;
        await this.pushUpdate();
        return {
          nextAction: { action: "ask_user", result: this.lastError },
          lastThought: "Too many consecutive scrolls. Asking user for help.",
          actionHistory: newActionHistory
        };
      }

      const lastThree = newActionHistory.slice(-3);
      
      if (lastThree.length === 3 && lastThree.every(h => h === actionHash)) {
        console.warn("[Agentic] Stagnant state detected, forcing scroll to break loop.");
        const scrollAction = { 
          action: "scroll", 
          value: "down", 
          thought: "Stagnant state detected (repeating same action). Forcing scroll to reveal obscured elements or change state." 
        };
        return {
          nextAction: scrollAction,
          lastThought: scrollAction.thought,
          actionHistory: []
        };
      }

      return {
        nextAction: action,
        lastThought: action.thought || "",
        globalPlan: action.global_plan || state.globalPlan,
        currentStepIndex: action.current_step_index !== undefined ? action.current_step_index : state.currentStepIndex,
        actionHistory: newActionHistory
      };
    });

    // 3. Executor Node: Executes actions inside the tab and monitors debugger results
    graph.addNode("executor", async (state) => {
      this.status = "acting";
      const payload = state.nextAction;
      const actions = payload.actions || [payload]; // Fallback for legacy schema
      
      let currentHistory = [...state.history];
      let needsLoad = false;
      let finalActionDetail = "";

      for (let i = 0; i < actions.length; i++) {
        if (!this.running) {
          return { status: "stopped", running: false, lastThought: "Halted by user." };
        }
        const action = actions[i];
        const type = action.action;
        finalActionDetail = formatActionDetail(action);
        
        await this.pushUpdate({ action });

        if (type === "done" || type === "synthesize") {
          ExperienceStore.saveExperience(this.goal, currentHistory);


          this.status = "done";
          this.lastThought = action.result || "Goal completed successfully.";
          this.running = false;
          await speedRenderer.disable(tabId);
          return { status: "done", running: false, lastThought: this.lastThought };
        }
        if (type === "ask_user") {
          this.status = "ask_user";
          this.lastError = action.result || "Awaiting confirmation inputs.";
          this.running = false;
          return { status: "ask_user", running: false, lastError: this.lastError };
        }

        if (type === "wait") {
          const waitTime = parseInt(action.value) || 5;
          await sleep(waitTime * 1000);
          currentHistory.push({
            thought: state.lastThought,
            action: type,
            detail: `Waited for ${waitTime} seconds`,
            outcome: "ok"
          });
          continue;
        }

        if (type === "query_datastore") {
          try {
            const { KnowledgeDatastore } = await import("./datastore");
            const results = await KnowledgeDatastore.query(action.value || "");
            let outcomeMsg = "";
            if (results.length > 0) {
              const resultStr = JSON.stringify(results.map(r => ({ name: r.item_name, price: r.price, url: r.vendor_url, stock: r.stock_status })));
              outcomeMsg = `Found in datastore: ${resultStr}. You MUST use the vendor_url to navigate directly.`;
            } else {
              outcomeMsg = `Item "${action.value}" completely missing from local datastore. Fallback to active web scraping (use delegate action).`;
            }
            
            currentHistory.push({
              thought: state.lastThought,
              action: type,
              detail: finalActionDetail,
              outcome: outcomeMsg
            });
            continue;
          } catch (err: any) {
             currentHistory.push({
               thought: state.lastThought,
               action: type,
               detail: finalActionDetail,
               outcome: `Datastore Error: ${err.message || String(err)}`
             });
             return {
               history: currentHistory,
               step: state.step + 1,
               lastAction: finalActionDetail,
               retryCount: state.retryCount + 1,
               lastError: err.message || String(err)
             };
          }
        }

        if (type === "mcp_call") {
          try {
            let args = {};
            if (action.elementId) {
              try {
                args = JSON.parse(action.elementId);
              } catch (e) {
                throw new Error("Failed to parse MCP arguments as JSON: " + action.elementId);
              }
            }
            const mcpResult = await mcpBridge.executeTool(action.value, args);
            const resultStr = typeof mcpResult === 'string' ? mcpResult : JSON.stringify(mcpResult);
            const truncatedPayload = resultStr.length > 5000 ? resultStr.substring(0, 5000) + "...[TRUNCATED]" : resultStr;
            
            currentHistory.push({
              thought: state.lastThought,
              action: type,
              detail: finalActionDetail,
              outcome: `MCP Result: ${truncatedPayload}`
            });
            continue;
          } catch (err: any) {
            currentHistory.push({
              thought: state.lastThought,
              action: type,
              detail: finalActionDetail,
              outcome: `Failed to execute MCP tool: ${err.message || String(err)}. FALLBACK REQUIRED: You MUST now use standard visual browsing (e.g. navigate to Amazon, type in search box) to achieve the user's goal.`
            });
            return {
              history: currentHistory,
              step: state.step + 1,
              lastAction: finalActionDetail,
              retryCount: state.retryCount + 1,
              lastError: err.message || String(err)
            };
          }
        }

        if (type === "store_memory") {
          this.memory[action.value] = action.data || action.result;
          currentHistory.push({
            thought: state.lastThought,
            action: type,
            detail: finalActionDetail,
            outcome: `Saved "${action.value}" to shared memory.`
          });
          continue;
        }

        if (type === "delegate") {
          try {
            const { Swarm } = await import("./swarm");
            await Swarm.spawnGhostWorker(action.url, action.value);
            currentHistory.push({
              thought: state.lastThought,
              action: type,
              detail: finalActionDetail,
              outcome: `Dispatched ghost worker for: ${action.value} at ${action.url}`
            });
            continue;
          } catch (err: any) {
            currentHistory.push({
              thought: state.lastThought,
              action: type,
              detail: finalActionDetail,
              outcome: `Failed to spawn ghost worker: ${err.message || String(err)}`
            });
            return {
              history: currentHistory,
              step: state.step + 1,
              lastAction: finalActionDetail,
              retryCount: state.retryCount + 1,
              lastError: err.message || String(err)
            };
          }
        }

        if (type === "clear_obstacle") {
          try {
            const nukerResult = await detectAndClearOverlays(tabId);
            const detail = nukerResult?.cleared ? nukerResult.details.join(" | ") : "No prominent obstacles detected or cleared.";
            
            currentHistory.push({
              thought: state.lastThought,
              action: type,
              detail: finalActionDetail,
              outcome: `Result: ${detail}`
            });
            continue;
          } catch (err: any) {
            currentHistory.push({
              thought: state.lastThought,
              action: type,
              detail: finalActionDetail,
              outcome: `Failed to execute: ${err.message || String(err)}`
            });
            return {
              history: currentHistory,
              step: state.step + 1,
              lastAction: finalActionDetail,
              retryCount: state.retryCount + 1,
              lastError: err.message || String(err)
            };
          }
        }

        if (type === "call_api") {
          try {
            const res = await fetch(action.value);
            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
            const data = await res.json();
            
            let stringified = JSON.stringify(data);
            if (stringified.length > 5000) {
              stringified = stringified.substring(0, 5000) + "...[TRUNCATED]";
            }

            currentHistory.push({
              thought: state.lastThought,
              action: type,
              detail: finalActionDetail,
              outcome: `Extracted Data: ${stringified}`
            });
            continue;
          } catch (err: any) {
            const msg = err.message || String(err);
            this.lastError = `API fetch failed: ${msg}`;
            
            currentHistory.push({
              thought: state.lastThought,
              action: type,
              detail: finalActionDetail,
              outcome: `API Error: ${msg}. Fall back to standard DOM interactions.`
            });
            return {
              history: currentHistory,
              step: state.step + 1,
              lastAction: finalActionDetail,
              retryCount: 0
            };
          }
        }

        if (type === "navigate") {
          try {
            await chrome.tabs.update(tabId, { url: action.url });
            this.forceFullSnapshot = true;
            this.hasGroundingImage = false;
            this.groundingImage = null;
            currentHistory.push({
              thought: state.lastThought,
              action: type,
              detail: finalActionDetail,
              outcome: "ok"
            });
            needsLoad = true;
            continue;
          } catch (err: any) {
             currentHistory.push({
               thought: state.lastThought,
               action: type,
               detail: finalActionDetail,
               outcome: `Navigation Error: ${err.message || String(err)}`
             });
             return {
               history: currentHistory,
               step: state.step + 1,
               lastAction: finalActionDetail,
               retryCount: state.retryCount + 1,
               lastError: err.message || String(err)
             };
          }
        }

        // Standard DOM Actions
        const result = await sendToTab(tabId, {
          type: MSG.EXECUTE_ACTION,
          action: type,
          elementId: action.elementId,
          value: action.value || action.matchText,
          matchText: action.matchText || action.value,
          url: action.url,
          submit: action.submit,
          snapshot: state.snapshot
        });

        if (!result?.ok) {
          const msg = result?.error || "Action failed.";
          if (result?.blocked) {
            this.lastError = msg;
            this.status = "blocked";
            this.running = false;
            await speedRenderer.disable(tabId);
            return { status: "blocked", running: false, lastError: msg };
          }
          throw new Error(msg);
        }

        if (result.x !== undefined && result.y !== undefined) {
          this.lastActionRect = { x: result.x, y: result.y, w: result.w || 0, h: result.h || 0 };
          try {
            await chrome.runtime.sendMessage({
              type: "DEBUGGER_CLICK",
              tabId,
              x: result.x,
              y: result.y
            });
          } catch (e) {
            console.warn("Debugger click failed, falling back to native click results", e);
          }
        }

        if (result.submitted) {
          finalActionDetail += " → submitted";
        }

        currentHistory.push({
          thought: state.lastThought,
          action: type,
          detail: finalActionDetail,
          outcome: "ok"
        });

        needsLoad = needsLoad || (type === "navigate" || type === "click" || type === "press" || action?.submit === true);

        if (i < actions.length - 1) {
          await waitForPageReady(tabId, 400);
        }
      } // End of pipeline loop

      if (needsLoad) {
        try {
          await waitForTabLoad(tabId, 20000);
        } catch {
          // Ignore timeout
        }
      }

      const expectedPlan = this.plannedSteps[this.currentStepIndex];
      if (expectedPlan) {
        const payloadAction = actions[0];
        let type = payloadAction.action;
        this.currentStepIndex++;
        if (type === "navigate") {
          this.plannedSteps = [];
          this.planConfidence = 0;
          this.currentStepIndex = 0;
        }
      }

      return {
        history: currentHistory,
        step: state.step + 1,
        lastAction: finalActionDetail,
        retryCount: 0
      };
    });

    // Edges configuration (routing controls)
    graph.addEdge("observer", (state) => {
      if (state.lastError && state.retryCount >= MAX_RETRIES) {
        // Don't halt, force a scroll to recover and reset retry count
        state.retryCount = 0;
        state.lastError = "";
      }
      return "planner";
    });

    graph.addEdge("planner", () => {
      return "executor";
    });

    graph.addEdge("executor", (state) => {
      if (!state.running) {
        return ""; // Finished execution
      }
      if (state.step >= MAX_STEPS) {
        this.status = "error";
        this.lastError = "Max workflow execution limit hit.";
        this.running = false;
        return "";
      }
      return "observer";
    });

    graph.setEntryPoint("observer");

    // Start graph traversal
    try {
      const finalState = await graph.execute(
        {
          tabId: this.tabId,
          running: this.running,
          goal: this.goal,
          history: this.history,
          step: this.step,
          retryCount: this.retryCount,
          status: this.status,
          lastThought: this.lastThought,
          lastAction: this.lastAction,
          lastError: this.lastError,
          globalPlan: this.globalPlan,
          currentStepIndex: this.currentStepIndex,
          actionHistory: this.actionHistory,
          snapshot: null,
          nextAction: null
        },
        async (stateUpdates) => {
          this.history = stateUpdates.history;
          this.step = stateUpdates.step;
          this.retryCount = stateUpdates.retryCount;
          this.lastThought = stateUpdates.lastThought;
          this.lastAction = stateUpdates.lastAction;
          this.lastError = stateUpdates.lastError;
          this.globalPlan = stateUpdates.globalPlan;
          this.currentStepIndex = stateUpdates.currentStepIndex;
          this.actionHistory = stateUpdates.actionHistory;
          await this.pushUpdate();
        }
      );

      this.running = finalState.running;
      this.status = finalState.status;
      await this.pushUpdate();
    } catch (err: any) {
      console.error("StateGraph execution crashed:", err);
      this.status = "error";
      this.lastError = err.message || String(err);
      this.running = false;
      if (this.tabId) await speedRenderer.disable(this.tabId);
      await this.pushUpdate();
    }
  }

  async stop() {
    this.running = false;
    this.status = "stopped";
    if (this.tabId) {
      await speedRenderer.disable(this.tabId);
    }
    await updateTabOverlay(this.tabId, { visible: false });
    await this.pushUpdate();
  }
}
