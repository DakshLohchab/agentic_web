import React, { useState, useEffect } from "react";
import { getSettings, saveSettings, ExtensionSettings } from "../utils/storage";
import { listProviders } from "../llm/index";
import { MSG, sendBackgroundMessage } from "../utils/messaging";
import { sanitizeModelId, validateModelId } from "../utils/model-id";
import { motion, AnimatePresence } from "framer-motion";
import { Tilt } from "../components/Tilt";
import { NeonMeshCanvas } from "../components/NeonMeshCanvas";
import { Magnetic } from "../components/Magnetic";

export default function App() {
  const [provider, setProvider] = useState("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [status, setStatus] = useState({ text: "", kind: "" });
  const [loading, setLoading] = useState(false);
  const [modelWarning, setModelWarning] = useState<string | null>(null);

  const providersList = listProviders();
  const providerDefaults = Object.fromEntries(
    providersList.map((p) => [p.id, p.defaultModel])
  );

  useEffect(() => {
    async function load() {
      const s = await getSettings();
      setProvider(s.provider);
      setApiKey(s.apiKey);
      setModel(s.model);
      setCustomBaseUrl(s.customBaseUrl || "");
    }
    load();
  }, []);

  // Update model warning when model changes
  useEffect(() => {
    const { warning } = validateModelId(model);
    setModelWarning(warning);
  }, [model]);

  const showStatus = (text: string, kind = "") => {
    setStatus({ text, kind });
    if (kind === "ok" || kind === "err") {
      setTimeout(() => {
        setStatus({ text: "", kind: "" });
      }, 12000);
    }
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextProv = e.target.value;
    setProvider(nextProv);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanModel = sanitizeModelId(model);
    const { valid, warning } = validateModelId(cleanModel);
    if (!valid) {
      showStatus(warning || "Invalid Model ID", "err");
      return;
    }

    const payload: ExtensionSettings = {
      provider,
      apiKey: apiKey.trim(),
      model: cleanModel,
      customBaseUrl: customBaseUrl.trim()
    };

    await saveSettings(payload);
    setModel(cleanModel);
    showStatus("Settings saved.", "ok");
  };

  const pingBackground = async () => {
    try {
      const res = await sendBackgroundMessage({ type: MSG.PING }, 5000);
      return res?.ok === true;
    } catch {
      return false;
    }
  };

  const handleTestConnection = async () => {
    const cleanModel = sanitizeModelId(model);
    if (!apiKey) {
      showStatus("Enter an API key first.", "err");
      return;
    }
    if (!cleanModel) {
      showStatus("Enter a model ID first (e.g. openai/gpt-4o-mini).", "err");
      return;
    }
    if (provider === "custom" && !customBaseUrl) {
      showStatus("Enter a custom API base URL for the Custom provider.", "err");
      return;
    }

    const { valid, warning } = validateModelId(cleanModel);
    if (!valid) {
      showStatus(warning || "Invalid Model ID", "err");
      return;
    }

    showStatus("Checking extension background…");
    setLoading(true);

    const alive = await pingBackground();
    if (!alive) {
      showStatus(
        "Background not responding — open chrome://extensions, find Agentic Browser, click Reload, then try again.",
        "err"
      );
      setLoading(false);
      return;
    }

    showStatus(`Testing ${provider} / ${cleanModel}… (up to 70s)`);

    const payload: ExtensionSettings = {
      provider,
      apiKey: apiKey.trim(),
      model: cleanModel,
      customBaseUrl: customBaseUrl.trim()
    };

    try {
      await saveSettings(payload);
      setModel(cleanModel);

      const res = await sendBackgroundMessage(
        {
          type: MSG.TEST_LLM,
          settings: payload
        },
        85000
      );

      if (res?.ok) {
        const prov = res.provider || provider;
        const mdl = res.model || cleanModel;
        const snippet = res.snippet || res.result?.snippet;
        const extra = snippet ? ` API replied: "${snippet}"` : "";
        showStatus(`Connected — ${prov} / ${mdl}.${extra}`, "ok");
      } else {
        showStatus(res?.error || "Test failed with no error message.", "err");
      }
    } catch (err: any) {
      showStatus(err.message || String(err), "err");
    } finally {
      setLoading(false);
    }
  };

  // Variants for staggered entrance animation
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 25,
      },
    },
  } as const;

  return (
    <div className="page-container">
      <NeonMeshCanvas />
      <Tilt>
        <div className={`panel-shell ${loading ? "testing" : ""} ${status.kind === "ok" ? "success" : ""}`}>
          <div className="panel-shell-border" />
          <header className="page-header">
          <div className="header-identity">
            <span className="material-symbols-outlined hub-logo">auto_awesome</span>
            <div>
              <h1>Agentic Browser</h1>
              <p className="subtitle">AI Provider Configuration</p>
            </div>
          </div>
        </header>

        <main className="panel-main">
          <div className="intro-context">
            <h2>Settings</h2>
            <p className="lead-text">
              Add your API key below. Keys are stored locally in your browser profile and never sent anywhere except directly to the provider you choose.
            </p>
          </div>

          <section className="banner-highlight">
            <div className="highlight-title">
              <span className="material-symbols-outlined highlight-icon">verified_user</span>
              <h3>OpenRouter (Recommended)</h3>
            </div>
            <p>
              One key for Claude, GPT-4o, Gemini, and Llama. Get yours at{" "}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">
                openrouter.ai/keys
              </a>.
            </p>
          </section>

          <form onSubmit={handleSave} className={`config-form ${loading ? "shimmer-active" : ""}`}>
            {/* AI Provider */}
            <div className="field-group">
              <label htmlFor="provider">AI Provider</label>
              <div className="select-wrapper">
                <select id="provider" name="provider" value={provider} onChange={handleProviderChange}>
                  {providersList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined dropdown-arrow">expand_more</span>
              </div>
            </div>

            {/* API Key */}
            <div className="field-group">
              <label htmlFor="apiKey">API Key</label>
              <div className="input-wrapper">
                <input
                  id="apiKey"
                  name="apiKey"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-…"
                />
                <span className="material-symbols-outlined security-badge">key</span>
              </div>
            </div>

            {/* Model ID */}
            <div className="field-group">
              <label htmlFor="model">Model</label>
              <div className="input-wrapper">
                <input
                  id="model"
                  name="model"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={providerDefaults[provider] || ""}
                  spellCheck="false"
                />
                <span className="material-symbols-outlined security-badge">deployed_code</span>
              </div>
              <p className="field-hint">
                Copy the exact slug from{" "}
                <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer">
                  openrouter.ai/models
                </a>{" "}
                — no trailing spaces or colons. Reasoning models may take up to 60 seconds on test.
              </p>
              {modelWarning && (
                <p id="modelWarning" className="field-warning" role="alert">
                  {modelWarning}
                </p>
              )}
            </div>

            {/* Custom URL */}
            <AnimatePresence>
              {provider === "custom" && (
                <motion.div
                  id="customUrlGroup"
                  className="field-group"
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  style={{ overflow: "hidden" }}
                >
                  <label htmlFor="customBaseUrl">Custom API URL</label>
                  <div className="input-wrapper">
                    <input
                      id="customBaseUrl"
                      name="customBaseUrl"
                      type="url"
                      value={customBaseUrl}
                      onChange={(e) => setCustomBaseUrl(e.target.value)}
                      placeholder="https://api.example.com/v1"
                    />
                    <span className="material-symbols-outlined security-badge">dns</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="form-actions">
              <Magnetic>
                <button type="button" id="testBtn" disabled={loading} onClick={handleTestConnection} className="btn-action btn-outline">
                  <span className="material-symbols-outlined">analytics</span>
                  Test Connection
                </button>
              </Magnetic>
              <Magnetic>
                <button type="submit" className="btn-action btn-filled">
                  <span className="material-symbols-outlined">save</span>
                  Save
                </button>
              </Magnetic>
            </div>
          </form>

          <AnimatePresence>
            {status.text && (
              <motion.div
                id="status"
                className={`status-toast ${status.kind}`}
                role="status"
                aria-live="polite"
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -15, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                {status.text}
              </motion.div>
            )}
          </AnimatePresence>

          <section className="models-directory">
            <h3>Example Models</h3>
            <motion.div
              className="archetype-grid"
              variants={containerVariants}
              initial="hidden"
              animate="show"
            >
              <motion.div className="archetype-item" variants={itemVariants}>
                <strong>OpenRouter</strong>
                <span>anthropic/claude-3.5-sonnet, openai/gpt-4o, google/gemini-2.0-flash-001</span>
              </motion.div>
              <motion.div className="archetype-item" variants={itemVariants}>
                <strong>OpenAI</strong>
                <span>gpt-4o, gpt-4o-mini</span>
              </motion.div>
              <motion.div className="archetype-item" variants={itemVariants}>
                <strong>Anthropic</strong>
                <span>claude-3-5-sonnet-20241022</span>
              </motion.div>
              <motion.div className="archetype-item" variants={itemVariants}>
                <strong>Google Gemini</strong>
                <span>gemini-2.0-flash</span>
              </motion.div>
            </motion.div>
          </section>
        </main>
      </div>
      </Tilt>
    </div>
  );
}
