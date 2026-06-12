import React, { useState, useEffect, useCallback, useRef } from "react";
import { MSG } from "../utils/messaging";
import { NeonMeshCanvas } from "../components/NeonMeshCanvas";
import { Magnetic } from "../components/Magnetic";

interface WorkerState {
  tabId: number;
  running: boolean;
  status: string;
  step: number;
  goal: string;
  lastThought: string;
  lastAction: string;
  lastError: string;
  global_plan?: string[];
  current_step_index?: number;
  history?: any[];
}

interface TabAccess {
  restricted: boolean;
  canAutoNavigate: boolean;
  message: string | null;
  suggestedUrl?: string | null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"chat" | "new_task">("chat");
  const [goal, setGoal] = useState("");
  const [swarm, setSwarm] = useState<Record<number, WorkerState>>({});
  const [tabAccess, setTabAccess] = useState<TabAccess>({ restricted: false, canAutoNavigate: false, message: null });
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [forceNewTab, setForceNewTab] = useState(false);
  const [replyText, setReplyText] = useState("");

  const handleReply = async (tabId: number) => {
    if (!replyText.trim()) return;
    try {
      const res = await chrome.runtime.sendMessage({ type: "USER_REPLY", tabId, reply: replyText });
      if (res?.ok) {
        setReplyText("");
        fetchClusterStatus();
      } else {
        setError(res?.error || "Failed to send reply.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to send reply.");
    }
  };

  // Poll for tab access details when the goal changes
  const checkTabAccess = useCallback(async (currentGoal: string) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const res = await chrome.runtime.sendMessage({
        type: MSG.GET_TAB_ACCESS,
        tabId: tab?.id,
        goal: currentGoal.trim()
      });
      if (res?.access) {
        setTabAccess(res.access);
      }
    } catch {
      // Background may not be loaded yet
    }
  }, []);

  useEffect(() => {
    checkTabAccess(goal);
  }, [goal, checkTabAccess]);

  // Fetch agent cluster status
  const fetchClusterStatus = useCallback(async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: MSG.GET_STATUS });
      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError.message || "Failed to fetch cluster status.");
        return;
      }
      if (res?.ok && res.swarm) {
        setSwarm(res.swarm);
        const hasActive = Object.values(res.swarm as Record<number, WorkerState>).some((w) => w.running);
        setIsRunning(hasActive);
      }
    } catch (err: any) {
      setError(err?.message || "Could not reach background service.");
    }
  }, []);

  // Poll on mount and set interval
  useEffect(() => {
    fetchClusterStatus();
    const interval = setInterval(fetchClusterStatus, 1500);
    
    // Listen for live agent updates
    const messageListener = (msg: any) => {
      if (msg.type === MSG.AGENT_UPDATE) {
        fetchClusterStatus();
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      clearInterval(interval);
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [fetchClusterStatus]);

  // Start the Agent
  const startAgent = async () => {
    setError(null);
    const trimmedGoal = goal.trim();
    if (!trimmedGoal) {
      setError("Enter a goal above, then click Start agent.");
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setError("No active tab found.");
      return;
    }

    // Programmatically open Side Panel so that the UI stays visible after the popup closes
    try {
      const currentWindow = await chrome.windows.getCurrent();
      if (currentWindow?.id) {
        await chrome.sidePanel.open({ windowId: currentWindow.id }).catch(() => {});
      }
    } catch (err) {
      console.warn("[Popup] Failed to open side panel:", err);
    }

    setIsRunning(true);

    try {
      // Unmount previous tab state and context frames to prevent goal context bleed
      await chrome.runtime.sendMessage({ type: MSG.STOP_AGENT });

      const res = await chrome.runtime.sendMessage({
        type: MSG.START_AGENT,
        goal: trimmedGoal,
        tabId: tab.id,
        forceNewTab: forceNewTab
      });

      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError.message || "Failed to start agent.");
        setIsRunning(false);
        return;
      }

      if (!res?.ok) {
        setError(
          res?.error ||
            "Failed to start. Open Settings and add your LLM API key, or use a goal that opens a website from a new tab."
        );
        if (res?.accessDenied) {
          checkTabAccess(goal);
        }
        setIsRunning(false);
        return;
      }

      setActiveTab("chat");
      await fetchClusterStatus();
    } catch (err: any) {
      setError(err?.message || "Extension error — reload the extension and try again.");
      setIsRunning(false);
    }
  };

  // Stop the Agent
  const stopAgent = async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: MSG.STOP_AGENT });
      if (res?.ok) {
        fetchClusterStatus();
      }
    } catch (err: any) {
      setError(err?.message || "Failed to stop agent.");
    }
  };

  const openOptionsPage = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    chrome.runtime.openOptionsPage();
  };

  // Get active running worker thought details
  const activeWorker = Object.values(swarm).find((w) => w.running);
  const statusLabel = activeWorker
    ? {
        observing: "Reading page…",
        thinking: "Thinking…",
        acting: "Acting…",
        retrying: "Retrying…"
      }[activeWorker.status] || `${activeWorker.status}…`
    : "";

  const chatLogRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  useEffect(() => {
    Object.values(chatLogRefs.current).forEach(ref => {
      if (ref) {
        ref.scrollTop = ref.scrollHeight;
      }
    });
  }, [swarm]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="app">
      <NeonMeshCanvas />
      <header className="app-header">
        <div className="brand">
          <span className="material-symbols-outlined brand-icon">auto_awesome</span>
          <div>
            <h1>Agentic Browser</h1>
            <p className="subtitle">Plan · Observe · Act</p>
          </div>
        </div>
        <Magnetic>
          <button type="button" onClick={() => openOptionsPage()} className="icon-btn" title="Settings" aria-label="Settings">
            <span className="material-symbols-outlined">settings</span>
          </button>
        </Magnetic>
      </header>

      <div className="tabs" style={{ display: "flex", justifyContent: "center", gap: "20px", margin: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "10px" }}>
        <button 
          onClick={() => setActiveTab("chat")} 
          style={{ background: "transparent", border: "none", color: activeTab === "chat" ? "#fff" : "#888", fontWeight: activeTab === "chat" ? "bold" : "normal", cursor: "pointer", borderBottom: activeTab === "chat" ? "2px solid var(--primary-color)" : "none", paddingBottom: "5px" }}
        >
          Chat Thread
        </button>
        <button 
          onClick={() => setActiveTab("new_task")} 
          style={{ background: "transparent", border: "none", color: activeTab === "new_task" ? "#fff" : "#888", fontWeight: activeTab === "new_task" ? "bold" : "normal", cursor: "pointer", borderBottom: activeTab === "new_task" ? "2px solid var(--primary-color)" : "none", paddingBottom: "5px" }}
        >
          New Task
        </button>
      </div>

      {/* Access banner */}
      {tabAccess.restricted && (
        <div className={`banner ${tabAccess.canAutoNavigate ? "banner-info" : "banner-warning"}`} role="alert">
          {tabAccess.message}
        </div>
      )}

      {/* Error box */}
      {error && (
        <div className="error-box" role="alert">
          <div className="error-header">
            <span className="material-symbols-outlined">error</span>
            <strong>Could not start</strong>
          </div>
          <p>{error}</p>
        </div>
      )}

      <main className="main-content">
        {activeTab === "new_task" && (
        <section className={`control-section ${isRunning ? "shimmer-active" : ""}`}>
          <label htmlFor="goal" className="section-label">Workspace Configuration</label>
          <p className="goal-hint">Initialize a fresh goal context for the agent.</p>

          <div className="textarea-wrapper">
            <textarea
              id="goal"
              rows={3}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g., Open YouTube and find the best video on ASIC design flow"
            />
          </div>

          <div className="parallel-options">
            <label className="checkbox-wrapper">
              <input
                type="checkbox"
                checked={forceNewTab}
                onChange={(e) => setForceNewTab(e.target.checked)}
              />
              <span>Launch in new tab (run in parallel)</span>
            </label>
            <p className="session-warning-hint">
              ⚠️ Parallel runs share the same browser profile context (cookies/sessions).
            </p>
          </div>

          <div className="actions">
            <Magnetic>
              <button
                id="runBtn"
                type="button"
                onClick={startAgent}
                disabled={isRunning && !!activeWorker}
                className="btn btn-primary"
              >
                <span className="material-symbols-outlined">rocket_launch</span>
                Initialize New Thread
              </button>
            </Magnetic>
            <Magnetic>
              <button
                id="stopBtn"
                type="button"
                onClick={stopAgent}
                disabled={!isRunning}
                className="btn btn-secondary"
              >
                <span className="material-symbols-outlined">stop_circle</span>
                Stop
              </button>
            </Magnetic>
          </div>
        </section>
        )}

        {/* Chat / Conversation Thread */}
        {activeTab === "chat" && (
        <section className="control-section">
          <label className="section-label">Active Conversation Thread</label>
          <div className="swarm-container">
            {Object.keys(swarm).length === 0 ? (
              <div className="empty-grid">
                <span className="material-symbols-outlined empty-icon">lan</span>
                <p>No active runs. Enter a goal above to launch the agent.</p>
              </div>
            ) : (
              Object.entries(swarm).map(([tabId, worker]) => {
                const isCardRunning = worker.running;
                const chipClass = ["done", "stopped", "error", "ask_user", "blocked"].includes(worker.status)
                  ? `chip-${worker.status}`
                  : "chip-running";

                return (
                  <div key={tabId} className="swarm-card">
                    <div className="swarm-row-top">
                      <div className="status-indicator">
                        <span className={`status-pulse ${isCardRunning ? "pulse-active" : "pulse-idle"}`}></span>
                        <span className="swarm-title">Tab {tabId}</span>
                      </div>
                      <span className={`chip ${chipClass}`}>{worker.status}</span>
                    </div>
                    <div className="chat-log" ref={(el) => (chatLogRefs.current[Number(tabId)] = el)} style={{ maxHeight: "250px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", padding: "10px 0" }}>
                      {worker.goal && (
                        <div style={{ alignSelf: "flex-end", background: "var(--primary-color, #534ab7)", padding: "8px 12px", borderRadius: "12px", maxWidth: "80%" }}>
                          <strong>Goal:</strong> {worker.goal}
                        </div>
                      )}
                      
                      {worker.history?.filter(h => ["ask_user", "user_reply", "done", "synthesize"].includes(h.action)).map((h, i) => {
                        const isUser = h.action === "user_reply";
                        const textContent = h.detail || h.outcome || h.action;
                        return (
                          <div key={i} style={{ 
                            alignSelf: isUser ? "flex-end" : "flex-start", 
                            background: isUser ? "var(--primary-color, #534ab7)" : "var(--surface-color, #2a2d3d)", 
                            padding: "8px 12px", 
                            borderRadius: "12px", 
                            maxWidth: "80%",
                            border: isUser ? "none" : "1px solid rgba(255,255,255,0.1)",
                            whiteSpace: "pre-wrap"
                          }}>
                            {textContent}
                            {!isUser && (
                              <button 
                                onClick={() => copyToClipboard(textContent)} 
                                title="Copy message" 
                                style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer", display: "block", marginTop: "4px", padding: 0 }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>content_copy</span>
                              </button>
                            )}
                          </div>
                        );
                      })}

                      {worker.running && worker.lastAction && (
                        <div style={{ alignSelf: "flex-start", fontStyle: "italic", fontSize: "0.85rem", color: "#888", marginTop: "4px" }}>
                          Agent is {worker.lastAction}...
                        </div>
                      )}

                      {worker.lastError && (
                        <div style={{ alignSelf: "flex-start", background: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444", color: "#ef4444", padding: "8px 12px", borderRadius: "12px", maxWidth: "80%" }}>
                          <strong>Error:</strong> {worker.lastError}
                        </div>
                      )}
                    </div>

                    {(worker.running || ["done", "ask_user", "error", "blocked", "stopped"].includes(worker.status)) && (
                      <div className="ask-user-container" style={{ marginTop: "10px", display: "flex", gap: "5px" }}>
                        <input 
                          type="text" 
                          value={replyText} 
                          onChange={(e) => setReplyText(e.target.value)} 
                          placeholder={worker.running && worker.status !== "ask_user" ? "Agent is working..." : "Your reply..."} 
                          disabled={worker.running && worker.status !== "ask_user"}
                          style={{ flex: 1, padding: "5px", borderRadius: "4px", border: "1px solid rgba(255, 255, 255, 0.2)", background: (worker.running && worker.status !== "ask_user") ? "rgba(0, 0, 0, 0.4)" : "rgba(0, 0, 0, 0.2)", color: (worker.running && worker.status !== "ask_user") ? "#888" : "#fff", cursor: (worker.running && worker.status !== "ask_user") ? "not-allowed" : "text" }} 
                          onKeyDown={(e) => { if (e.key === 'Enter' && !(worker.running && worker.status !== "ask_user")) handleReply(Number(tabId)); }}
                        />
                        <button 
                          onClick={() => handleReply(Number(tabId))} 
                          disabled={worker.running && worker.status !== "ask_user"}
                          className="btn btn-primary" 
                          style={{ padding: "5px 10px", minWidth: "auto", fontSize: "0.9rem", opacity: (worker.running && worker.status !== "ask_user") ? 0.5 : 1, cursor: (worker.running && worker.status !== "ask_user") ? "not-allowed" : "pointer" }}
                        >
                          {(worker.running && worker.status !== "ask_user") ? "Working..." : "Send"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
        )}
      </main>

      <footer className="app-footer footer-row">
        <a href="#" onClick={openOptionsPage}>
          <span>LLM provider & API key</span>
          <span className="material-symbols-outlined">arrow_forward</span>
        </a>
        {activeWorker && (
          <span className="step-counter">
            Step {activeWorker.step} / {30}
          </span>
        )}
      </footer>
    </div>
  );
}
