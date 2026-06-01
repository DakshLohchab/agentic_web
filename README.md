# Agentic Browser Extension

Manifest V3 Chrome extension that runs a **ReAct** loop on the active tab: **Plan → Observe → Think → Act**. You set a natural-language goal in the popup; the background service worker calls your chosen LLM; the content script snapshots the DOM and executes actions.

## Load unpacked

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension` folder in this repo (`d:\web_extenstion\extension`)

## Configure LLM (required)

1. Click the extension icon → **Configure LLM provider & API key**, or open **Extension options**
2. Choose a provider and paste your API key (never included in the extension bundle)
3. Set a **model id** and click **Save**, then **Test connection**

### OpenRouter (first-class)

1. Create a key at [openrouter.ai/keys](https://openrouter.ai/keys)
2. Provider: **OpenRouter**
3. Model examples: `anthropic/claude-3.5-sonnet`, `openai/gpt-4o`, `google/gemini-2.0-flash-001`

OpenRouter uses OpenAI-compatible `POST /v1/chat/completions` with Bearer auth.

### Other providers

| Provider   | Endpoint / notes |
|-----------|------------------|
| OpenAI    | `api.openai.com/v1/chat/completions` |
| Anthropic | Native Messages API (`/v1/messages`) |
| Gemini    | `generativelanguage.googleapis.com` generateContent |
| Custom    | Your base URL + OpenAI-compatible chat completions |

Settings are stored in `chrome.storage.sync`: `{ provider, apiKey, model, customBaseUrl? }`.

## Why do I need an API key?

This extension has **no built-in brain**. On each step it:

1. Snapshots the page (buttons, links, inputs, video titles)
2. Sends the snapshot + your goal + history to **your** LLM (OpenRouter, OpenAI, etc.)
3. Gets back one JSON action (`click`, `type`, `press`, …)
4. Runs that action in the tab, then repeats until `done`

**Without an API key**, there is nothing to decide the next step. Hardcoding scripts per site (e.g. “always click #search”) breaks whenever YouTube or any site changes its UI.

- Keys stay **local** in `chrome.storage.sync` (your browser profile)
- You choose the provider and model (OpenRouter is a good default)
- Requests go **directly** from the extension to that provider — no extension backend

## Usage

1. Open the popup from **any** tab (including Chrome new tab), enter a goal, click **Run**
2. Watch progress in the popup, **side panel**, or the small **floating chip** on the page
3. Use **Stop** to cancel; you’ll see the last action (e.g. `type → submitted`, `click @el-12`)

**Example (YouTube):**  
`open and run the video which is best for asic design flow`  
→ opens YouTube → types query → Enter → clicks best result → `done` when the watch page loads.

### Getting access (important)

Chrome blocks extensions from controlling internal pages. These URLs **cannot** be automated:

- `chrome://` (extensions, settings, new tab internals)
- `chrome-extension://`, `edge://`, `about:`
- Chrome Web Store

**What to do**

1. **Easiest:** Stay on Chrome **new tab** and run a goal that names a site, e.g.  
   `open youtube and find the best video for ASIC design flow`  
   The extension opens **a new tab** at `https://www.youtube.com` and runs the agent there.
2. **Or:** Open any normal **https** page first, then **Run** (agent uses that tab).
3. The extension **cannot run on** `chrome://` pages (Chrome security). It only controls regular https sites.
4. Popup banner: restricted tab + goal with a site → **Run (opens tab)** is enabled.

Supported auto-open names include: youtube, google, github, reddit, amazon, wikipedia, stackoverflow, linkedin, and explicit URLs in the goal text.

## Architecture

```
popup/options UI
       ↓ chrome.runtime.sendMessage
background.js (service worker) — agent loop, LLM HTTP (no CORS)
       ↓
content.js — DOM snapshot, click/type/scroll/navigate/extract
```

- **agent/loop.js** — ReAct orchestration until `done` / `ask_user`; waits for page load between steps
- **agent/heuristics.js** — light YouTube/search nudges (Enter after type, pick video on results)
- **agent/system-prompt.js** — JSON actions including `press` and `submit` on `type`
- **llm/providers.js** — OpenRouter, OpenAI, Anthropic, Gemini, Custom adapters
- **utils/storage.js** — `chrome.storage.sync` helpers

### DOM snapshot

Interactables: `button`, `input`, `select`, `textarea`, `a[href]`, `[role=button]`, etc. Each gets a stable `el-N` id, tag, text (80 chars), placeholder, type, href.

### Safety

- No payment/sensitive field typing
- Submit-like clicks blocked until agent uses `ask_user`
- After 3 failed retries, loop stops with an error / ask-user path

## Security

- API keys exist only in **your** browser profile (`chrome.storage.sync`)
- LLM requests go **directly** from the extension background worker to the provider you configured
- No default keys, telemetry, or backend in this MVP

## Known limitations

- **Service worker sleep**: Long pauses between steps may suspend the worker; steps are kept short (~800ms between iterations). For heavy tasks, keep the popup open or accept occasional restarts.
- **chrome://** and Web Store pages cannot be scripted (use auto-navigate from goal or open https first)
- **SPA navigation** may require extra observe cycles after `navigate`
- **iframes** are not traversed; only the top document is controlled
- LLM JSON parsing can fail on malformed responses; retries apply
- Gemini and Anthropic model names must match each vendor’s current API ids

## File layout

```
extension/
  manifest.json
  background.js
  content.js
  popup.html, popup.js, popup.css
  options.html, options.js, options.css
  agent/system-prompt.js, agent/loop.js, agent/heuristics.js
  llm/index.js, llm/providers.js
  utils/storage.js, utils/messaging.js, utils/tab-access.js
docs/UI-FIGMA.md — Figma frame specs and CSS token mapping
```

Plain JavaScript ES modules — no build step required.

## UI design (Figma)

See [docs/UI-FIGMA.md](docs/UI-FIGMA.md) for a 360×520 frame spec, component map, and CSS variable names (`--color-primary`, etc.) to sync from Figma tokens.
