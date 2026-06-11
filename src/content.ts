const INTERACTIVE_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "a[href]",
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="searchbox"]',
  '[contenteditable="true"]',
  "mat-button",
  "md-button",
  '[data-testid*="button"]',
  '[data-testid*="deploy"]'
].join(", ");

const OVERLAY_ID = "agentic-browser-overlay";

let elementMap = new Map<string, HTMLElement>();
let prevSnapshot: any[] | null = null;
let elementIdCounter = 0;

function isVisible(el: HTMLElement | null): boolean {
  if (!el || el.closest("[hidden], template")) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isInteractive(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.cursor === "pointer") return true;
  if (style.pointerEvents === "none") return false;

  // contenteditable elements are always interactive
  if (el.isContentEditable || el.hasAttribute("contenteditable")) return true;

  const tagName = el.tagName.toLowerCase();
  const role = el.getAttribute("role");
  const isStandardInteractive =
    ["button", "input", "select", "textarea", "a"].includes(tagName) ||
    ["button", "link", "menuitem", "textbox", "combobox", "searchbox"].includes(role || "");

  if (isStandardInteractive) return true;

  // Google Maps and other SPAs use jsaction attributes for interactivity
  if (el.hasAttribute("jsaction") || el.hasAttribute("data-trackingid") || el.hasAttribute("guidedhelpid")) return true;
  // Elements with tabindex="0" that are not native inputs are explicitly made keyboard-interactive
  const tabIndex = el.getAttribute("tabindex");
  if (tabIndex === "0" && !["a", "button", "input", "textarea", "select"].includes(el.tagName.toLowerCase())) return true;

  // Check common click handler attributes
  if ((el as any).onclick || el.hasAttribute("onclick") || el.hasAttribute("@click") || el.hasAttribute("v-on:click")) return true;

  return false;
}

function labelText(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  
  // Google Maps uses data-tooltip and aria-label on action buttons
  const dataTooltip = el.getAttribute("data-tooltip");
  if (dataTooltip) return dataTooltip.trim();
  const dataValue = el.getAttribute("data-value");
  if (dataValue) return dataValue.trim();
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.textContent?.trim() || "";
  }
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") return ((el as HTMLInputElement).value || el.getAttribute("placeholder") || "").trim();
  return (el.innerText || el.textContent || (el as HTMLInputElement).value || "").trim().replace(/\s+/g, " ");
}

function fieldValue(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return (el as HTMLInputElement).value || "";
  if (el.isContentEditable) return (el.innerText || el.textContent || "").trim();
  return "";
}

function getClickBlockReason(label: string, el: HTMLElement): string | null {
  const text = (label || "").toLowerCase();
  const type = (el as HTMLInputElement).type || "";
  
  // Explicit bypass for travel/hotel dates
  const isTravelDate = /\b(check-?out\s*date|check-?in)\b/i.test(text) || 
                       (/\bcheck-?out\b/i.test(text) && /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mon|tue|wed|thu|fri|sat|sun)\b/i.test(text)) ||
                       (el.getAttribute('role') === 'gridcell' && /\bcheck-?out\b/i.test(text));

  if (isTravelDate) return null;

  const payment =
    /\b(pay\s*now|checkout|purchase|buy\s+now|place\s+order|add\s+payment|credit\s*card)\b/i.test(text) ||
    (type === "submit" && /\b(pay|purchase|checkout)\b/i.test(text));
    
  if (payment) {
    return "Payment or checkout blocked. Confirm with user (ask_user) first.";
  }
  return null;
}

function isSearchLikeInput(el: HTMLElement): boolean {
  const type = (el.getAttribute("type") || "").toLowerCase();
  if (type === "search") return true;
  const role = el.getAttribute("role") || "";
  if (role === "searchbox" || role === "combobox") return true;
  const meta = `${el.getAttribute("name") || ""} ${el.id || ""} ${el.getAttribute("placeholder") || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
  return /search|query|\bq\b/.test(meta);
}

function dispatchKey(el: HTMLElement, key: string) {
  const code = key === "Enter" ? "Enter" : key;
  const keyCode = key === "Enter" ? 13 : 0;
  const opts = { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent("keydown", opts));
  el.dispatchEvent(new KeyboardEvent("keypress", opts));
  el.dispatchEvent(new KeyboardEvent("keyup", opts));
}

function submitSearchField(el: HTMLElement): boolean {
  dispatchKey(el, "Enter");
  const form = el.closest("form");
  if (form) {
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.submit();
    return true;
  }
  const searchBtn =
    document.querySelector('button#search-icon-legacy, button[aria-label*="Search"], button[aria-label*="search"]') as HTMLElement ||
    el.parentElement?.querySelector("button");
  if (searchBtn) {
    if (typeof searchBtn.click === "function") {
      searchBtn.click();
    } else {
      searchBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      searchBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      searchBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }
    return true;
  }
  return true;
}

function drawMarkers(interactables: any[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.id = "agent-vision-canvas";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.zIndex = "2147483647";
  canvas.style.pointerEvents = "none";
  document.documentElement.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (ctx) {
    interactables.forEach((i) => {
      const { x, y, w, h } = i.rect;
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return;

      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = "#ff0000";
      ctx.font = "12px sans-serif";
      ctx.fillText(i.id, x, y > 15 ? y - 5 : y + 15);
    });
  }

  return canvas;
}

function clearMarkers() {
  document.getElementById("agent-vision-canvas")?.remove();
}

function collectAllElements(root: Document | ShadowRoot, elements: HTMLElement[] = []): HTMLElement[] {
  if (!root) return elements;
  const children = root.querySelectorAll("*");
  for (const el of Array.from(children) as HTMLElement[]) {
    elements.push(el);
    if (el.shadowRoot) {
      collectAllElements(el.shadowRoot, elements);
    }
  }
  return elements;
}

function ensurePaintClear(): Promise<void> {
  return new Promise((resolve) => {
    const runDoubleRAF = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    };

    if (document.readyState !== "complete") {
      window.addEventListener("load", () => {
        runDoubleRAF();
      }, { once: true });
      // Safety timeout fallback
      setTimeout(runDoubleRAF, 250);
    } else {
      runDoubleRAF();
    }
  });
}

async function buildSnapshot(withMarkers = false) {
  await ensurePaintClear();
  elementMap = new Map();
  const allElements = collectAllElements(document);
  const interactiveNodes = allElements.filter((el) => isVisible(el) && isInteractive(el));

  const inViewport = interactiveNodes.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= -50 && r.bottom <= window.innerHeight + 200;
  });
  const offScreen = interactiveNodes.filter((el) => !inViewport.includes(el));

  const isInputField = (el: HTMLElement) => {
    const tagName = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || "";
    return ["input", "textarea", "select"].includes(tagName) ||
           el.isContentEditable ||
           ["textbox", "searchbox", "combobox"].includes(role) ||
           el.hasAttribute("contenteditable");
  };

  const sortedViewport = [
    ...inViewport.filter((el) => isInputField(el)),
    ...inViewport.filter((el) => !isInputField(el))
  ];

  const prioritized = [...sortedViewport, ...offScreen].slice(0, 85);

  const interactables = prioritized.map((el) => {
    let id = el.getAttribute("data-agent-id");
    if (!id) {
      id = `el-${elementIdCounter++}`;
      el.setAttribute("data-agent-id", id);
    }
    elementMap.set(id, el);
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const text = labelText(el).slice(0, 80);
    
    return {
      id,
      tag,
      text,
      value: fieldValue(el).slice(0, 80),
      placeholder: el.getAttribute("placeholder") || "",
      type: el.getAttribute("type") || "",
      href: tag === "a" ? (el as HTMLAnchorElement).href : "",
      role: el.getAttribute("role") || "",
      focused: document.activeElement === el || el.contains(document.activeElement),
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      }
    };
  });

  if (withMarkers) {
    drawMarkers(interactables);
  }

  const condensed = interactables.map(i => 
    `[${i.id}] ${i.tag} "${i.text}" {x: ${i.rect.x}, y: ${i.rect.y}, w: ${i.rect.w}, h: ${i.rect.h}}`
  ).join("\n");

  const snapshotTokenEstimate = interactables.length * 25;
  console.log(`[Agentic] Full Snapshot token estimate: ${snapshotTokenEstimate}`);

  return {
    ok: true,
    title: document.title,
    url: location.href,
    interactables,
    condensed,
    snapshotTokenEstimate
  };
}

async function buildSnapshotDiff(lastActionRect?: {x: number, y: number, w: number, h: number}) {
  const full = await buildSnapshot(false);
  if (!full.ok) return full;

  if (!prevSnapshot) {
    prevSnapshot = full.interactables;
    return { ...full, isDiff: false };
  }

  const current = full.interactables;
  const prevMap = new Map(prevSnapshot.map(i => [i.id, i]));
  
  const diffInteractables = current.filter(item => {
    if (item.tag === "input" || item.tag === "textarea" || item.tag === "select" || item.role === "textbox" || item.role === "searchbox" || item.role === "combobox") return true;
    
    const prev = prevMap.get(item.id);
    if (!prev) return true;
    
    if (prev.value !== item.value || prev.text !== item.text) return true;
    
    if (lastActionRect) {
      const dx = Math.max(0, lastActionRect.x - (item.rect.x + item.rect.w), item.rect.x - (lastActionRect.x + lastActionRect.w));
      const dy = Math.max(0, lastActionRect.y - (item.rect.y + item.rect.h), item.rect.y - (lastActionRect.y + lastActionRect.h));
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= 200) return true;
    }
    
    return false;
  });

  prevSnapshot = current;

  const condensed = diffInteractables.map(i => 
    `[${i.id}] ${i.tag} "${i.text}" {x: ${i.rect.x}, y: ${i.rect.y}, w: ${i.rect.w}, h: ${i.rect.h}}`
  ).join("\n");

  const snapshotTokenEstimate = diffInteractables.length * 25;
  console.log(`[Agentic] Diff Snapshot token estimate: ${snapshotTokenEstimate} (Unchanged: ${current.length - diffInteractables.length})`);

  return {
    ok: true,
    title: full.title,
    url: full.url,
    interactables: diffInteractables,
    condensed,
    isDiff: true,
    unchangedCount: current.length - diffInteractables.length,
    snapshotTokenEstimate
  };
}

function findElement(elementId: string | null | undefined, snapshot: any, action: any): HTMLElement | null {
  if (elementId && elementMap.has(elementId)) return elementMap.get(elementId) || null;

  if (!snapshot?.interactables?.length) return null;
  const target = snapshot.interactables.find((i: any) => i.id === elementId);
  if (target) {
    const byMeta = snapshot.interactables.find(
      (i: any) =>
        i.text === target.text &&
        i.placeholder === target.placeholder &&
        i.tag === target.tag
    );
    if (byMeta && elementMap.has(byMeta.id)) return elementMap.get(byMeta.id) || null;
  }

  const needle = (action?.value || action?.matchText || "").toLowerCase().trim();
  if (needle) {
    let best: HTMLElement | null = null;
    let bestScore = 0;
    for (const item of snapshot.interactables) {
      const el = elementMap.get(item.id);
      if (!el) continue;
      const hay = `${item.text} ${item.placeholder} ${item.role}`.toLowerCase();
      if (!hay.includes(needle) && !needle.split(/\s+/).every((w: string) => hay.includes(w))) continue;
      const score = hay === needle ? 100 : hay.includes(needle) ? 50 : 25;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) return best;

    // Deep child text search — for Google Maps where text is in nested spans
    if (needle && !best) {
      for (const item of snapshot.interactables) {
        const el = elementMap.get(item.id);
        if (!el) continue;
        const deepText = (el.innerText || el.textContent || "").toLowerCase().trim();
        if (deepText === needle || deepText.startsWith(needle)) {
          best = el;
          break;
        }
      }
      if (best) return best;
    }
  }

  const clickable = snapshot.interactables.find((i: any) => i.tag === "button" || i.role === "button");
  return clickable ? elementMap.get(clickable.id) || null : null;
}

function scrollPage(value: string | null | undefined) {
  const v = (value || "down").toLowerCase();
  const h = window.innerHeight * 0.85;
  if (v === "up") window.scrollBy(0, -h);
  else if (v === "top") window.scrollTo(0, 0);
  else if (v === "bottom") window.scrollTo(0, document.body.scrollHeight);
  else window.scrollBy(0, h);
  return { ok: true };
}

function extractText(hint: string | null | undefined) {
  const hintLower = (hint || "").toLowerCase();
  let text = document.body.innerText || "";

  /**
   * Smart Price Extraction Fallback:
   * If the LLM requests a price extraction but targets the wrong element,
   * we sweep the entire page text for currency patterns to guarantee a result.
   */
  if (hintLower && (hintLower.includes("price") || hintLower.includes("cost") || hintLower.includes("total"))) {
    const priceRegex = /(?:Rs\.?|INR|₹|\$)\s*([0-9,]+\.?[0-9]*)/i;
    const match = text.match(priceRegex);
    if (match) {
      return { ok: true, data: `Extracted Price Fallback: ${match[0]}` };
    }
  }

  if (hintLower) {
    const lines = text.split("\n").filter((l) => l.toLowerCase().includes(hintLower));
    text = lines.join("\n") || text;
  }
  return { ok: true, data: text.slice(0, 8000) };
}

function setTypeValue(el: HTMLElement, value: string | null | undefined) {
  el.focus();
  
  if (el.isContentEditable) {
    try {
      el.focus();
      document.execCommand("selectAll", false);
      document.execCommand("delete", false);
      
      const success = document.execCommand("insertText", false, value ?? "");
      const currentText = el.textContent || el.innerText || "";
      if (success && currentText.includes(value ?? "")) {
        return;
      }
      console.warn("execCommand insertText failed or didn't set text, running fallback");
    } catch (e) {
      console.warn("execCommand insertText threw error, running fallback", e);
    }
  }

  const isInput = !el.isContentEditable;
  if (isInput) {
    const inputEl = el as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(inputEl, "value")?.set;
    const prototype = Object.getPrototypeOf(inputEl);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

    if (valueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter?.call(inputEl, "");
    } else if (prototypeValueSetter) {
      prototypeValueSetter.call(inputEl, "");
    } else {
      inputEl.value = "";
    }
  } else {
    el.textContent = "";
  }

  const chars = (value ?? "").split("");
  for (const char of chars) {
    const opts = { key: char, char: char, keyCode: char.charCodeAt(0), bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent("keydown", opts));
    el.dispatchEvent(new KeyboardEvent("keypress", opts));
    
    if (el.isContentEditable) {
      el.textContent += char;
    } else {
      const inputEl = el as HTMLInputElement;
      const currentValue = inputEl.value;
      const valueSetter = Object.getOwnPropertyDescriptor(inputEl, "value")?.set;
      const prototype = Object.getPrototypeOf(inputEl);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

      if (valueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter?.call(inputEl, currentValue + char);
      } else if (prototypeValueSetter) {
        prototypeValueSetter.call(inputEl, currentValue + char);
      } else {
        inputEl.value += char;
      }
    }
    
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: char }));
    el.dispatchEvent(new KeyboardEvent("keyup", opts));
  }

  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function verifyDOMShift(actionFn: () => void | Promise<void>): Promise<boolean> {
  return new Promise(async (resolve) => {
    let shifted = false;
    let timer: any;
    
    const observer = new MutationObserver(() => {
      shifted = true;
      cleanup();
      resolve(true);
    });
    
    const onPopState = () => {
      shifted = true;
      cleanup();
      resolve(true);
    };

    function cleanup() {
      observer.disconnect();
      window.removeEventListener("popstate", onPopState);
      if (timer) clearTimeout(timer);
    }
    
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener("popstate", onPopState);
    
    timer = setTimeout(() => {
      if (!shifted) {
        cleanup();
        resolve(false);
      }
    }, 1500);

    try {
      await actionFn();
    } catch (e) {
      cleanup();
      throw e;
    }
  });
}

async function executeAction(payload: any) {
  const { action, elementId, value, url, snapshot, submit } = payload;

  try {
    switch (action) {
      case "navigate":
        if (!url) throw new Error("navigate requires url");
        window.location.href = url;
        return { ok: true };

      case "scroll":
        if (payload.fastPath) {
          const targetY = payload.targetY !== undefined ? payload.targetY : window.scrollY;
          const targetX = payload.targetX !== undefined ? payload.targetX : window.scrollX;
          window.scrollTo({ top: targetY, left: targetX, behavior: 'instant' });
          return { ok: true };
        }
        return scrollPage(value);

      case "extract":
        return extractText(value);

      case "press": {
        const el = findElement(elementId, snapshot, payload) || document.activeElement as HTMLElement;
        if (!el) throw new Error("No element for press");
        el.scrollIntoView({ block: "center", behavior: "instant" });
        el.focus();
        const key = value || "Enter";
        const shifted = await verifyDOMShift(() => {
          if (key === "Enter" && isSearchLikeInput(el)) {
            submitSearchField(el);
          } else {
            dispatchKey(el, key);
          }
        });
        const result: any = { ok: true, submitted: key === "Enter" };
        if (!shifted) result.warning = "Action dispatched but no resulting DOM layout shift was detected. Verify success.";
        return result;
      }

      case "click": {
        const el = findElement(elementId, snapshot, payload);
        if (!el) throw new Error(`Element not found: ${elementId}`);
        const label = labelText(el);
        const blockReason = getClickBlockReason(label, el);
        if (blockReason) {
          return { ok: false, blocked: true, error: blockReason };
        }
        el.scrollIntoView({ block: "center", behavior: "instant" });
        const rect = el.getBoundingClientRect();
        const x = Math.round(rect.left + rect.width / 2);
        const y = Math.round(rect.top + rect.height / 2);
        
        const topEl = document.elementFromPoint(x, y);
        if (topEl && !el.contains(topEl) && !topEl.contains(el)) {
          console.warn(`Element might be obscured by ${topEl.tagName}. Proceeding anyway to allow DEBUGGER_CLICK to resolve it.`);
          // We no longer return blocked: true here, because Google Maps uses sibling ripple divs
          // that technically obscure the SVG button but should receive the click.
        }

        const shifted = await verifyDOMShift(() => {
          if (typeof el.click === "function") {
            el.click();
          } else {
            el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
            el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
            el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
          }
        });
        const result: any = { ok: true, x, y, w: Math.round(rect.width), h: Math.round(rect.height) };
        if (!shifted) result.warning = "Action dispatched but no resulting DOM layout shift was detected. Verify success.";
        return result;
      }

      case "type": {
        const el = findElement(elementId, snapshot, payload);
        if (!el) throw new Error(`Element not found: ${elementId}`);
        const sensitive = /card|cvv|cvc|password|ssn|routing/i;
        const ph = (el.getAttribute("placeholder") || "") + (el.getAttribute("name") || "") + el.id;
        if (sensitive.test(ph) && value) {
          return { ok: false, error: "Refusing to type into sensitive field" };
        }
        el.scrollIntoView({ block: "center", behavior: "instant" });
        el.focus();

        // Safety gate: Wait 100ms for DOM layout and focus state to settle
        await new Promise((resolve) => setTimeout(resolve, 100));

        const rect = el.getBoundingClientRect();
        const x = Math.round(rect.left + rect.width / 2);
        const y = Math.round(rect.top + rect.height / 2);

        const shouldSubmit = submit !== false && (submit === true || isSearchLikeInput(el));
        const shifted = await verifyDOMShift(() => {
          setTypeValue(el, value);
          if (shouldSubmit) {
            submitSearchField(el);
          }
        });
        const result: any = { ok: true, submitted: shouldSubmit, x, y, w: Math.round(rect.width), h: Math.round(rect.height) };
        if (!shifted) result.warning = "Action dispatched but no resulting DOM layout shift was detected. Verify success.";
        return result;
      }

      case "copy_data": {
        const el = findElement(elementId, snapshot, payload);
        let textToCopy = "";
        if (el) {
          textToCopy = el.innerText || extractText(value).data || "";
        } else {
          textToCopy = extractText(value).data || "";
        }
        try {
          await navigator.clipboard.writeText(textToCopy);
          return { ok: true, copied: textToCopy.slice(0, 50) + (textToCopy.length > 50 ? "..." : "") };
        } catch (e: any) {
          return { ok: false, error: "Clipboard write permission denied or failed: " + e.message };
        }
      }

      case "paste_data": {
        try {
          const text = await navigator.clipboard.readText();
          const el = findElement(elementId, snapshot, payload);
          if (!el) throw new Error(`Element not found for paste: ${elementId}`);
          
          el.scrollIntoView({ block: "center" });
          setTypeValue(el, text);
          
          return { ok: true, pastedLength: text.length };
        } catch (e: any) {
          return { ok: false, error: "Clipboard read permission denied or failed: " + e.message };
        }
      }

      case "extract_pdf": {
        try {
          if (!url && !value) throw new Error("extract_pdf requires a url or value pointing to the PDF");
          const targetUrl = url || value;
          const res = await fetch(targetUrl);
          const arrayBuffer = await res.arrayBuffer();
          
          let extractedText = "";
          try {
            // Attempt dynamic import of PDF.js from CDN (may be blocked by extension CSP)
            const pdfUrl = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
            // Use new Function to hide the import keyword from the static parser 
            // which throws SyntaxError in classic extension content scripts.
            const importFunc = new Function('url', 'return import(url)');
            const pdfjsLib = await importFunc(pdfUrl);
            pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
            const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const content = await page.getTextContent();
              extractedText += content.items.map((item: any) => item.str).join(" ") + "\n";
            }
          } catch (cdnErr) {
            console.warn("PDF parser utility blocked or failed, using text layout parser fallback", cdnErr);
            const view = new Uint8Array(arrayBuffer);
            let str = "";
            for (let i = 0; i < view.length; i++) {
               const char = view[i];
               if (char >= 32 && char <= 126) str += String.fromCharCode(char);
               else str += " ";
            }
            extractedText = str.replace(/\s+/g, ' ').match(/[a-zA-Z0-9\s.,?!'"()-]{15,}/g)?.join("\n") || "No readable text extracted.";
          }
          
          return { ok: true, text: extractedText.slice(0, 15000) };
        } catch (e: any) {
          return { ok: false, error: "Failed to extract PDF: " + e.message };
        }
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) };
  }
}

function updateOverlay(payload: any) {
  if (payload.visible === false || !payload.running) {
    document.getElementById(OVERLAY_ID)?.remove();
    return;
  }

  let root = document.getElementById(OVERLAY_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = OVERLAY_ID;
    root.setAttribute("aria-live", "polite");
    
    const shadow = root.attachShadow({ mode: "open" });
    
    const style = document.createElement("style");
    style.textContent = `
      .hud-card {
        box-sizing: border-box;
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 310px;
        padding: 14px;
        border-radius: 12px;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 500;
        color: #f1f3f9;
        background: rgba(18, 20, 32, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(83, 74, 183, 0.4);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 2147483646;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: auto;
      }
      
      .hud-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding-bottom: 8px;
      }
      
      .status-group {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .pulse-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #3b82f6;
      }
      
      .pulse-active {
        animation: pulse 1.5s infinite ease-in-out;
      }
      
      @keyframes pulse {
        0% { opacity: 0.4; transform: scale(0.9); }
        50% { opacity: 1; transform: scale(1.1); }
        100% { opacity: 0.4; transform: scale(0.9); }
      }
      
      .status-text {
        font-weight: 600;
        text-transform: capitalize;
        letter-spacing: 0.3px;
      }
      
      .stop-btn {
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.4);
        color: #ef4444;
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        outline: none;
      }
      
      .stop-btn:hover {
        background: #ef4444;
        color: #ffffff;
        box-shadow: 0 0 10px rgba(239, 68, 68, 0.3);
      }
      
      .hud-body {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      
      .step-line {
        font-size: 11px;
        color: #94a3b8;
        display: flex;
        justify-content: space-between;
      }
      
      .action-line {
        background: rgba(255, 255, 255, 0.04);
        padding: 6px 8px;
        border-radius: 6px;
        font-family: monospace;
        font-size: 11px;
        color: #c7d2fe;
        word-break: break-all;
        border: 1px solid rgba(255, 255, 255, 0.03);
      }
      
      .thought-line {
        font-style: italic;
        color: #cbd5e1;
        font-size: 11.5px;
        line-height: 1.4;
      }
    `;
    shadow.appendChild(style);
    
    const card = document.createElement("div");
    card.className = "hud-card";
    card.innerHTML = `
      <div class="hud-header">
        <div class="status-group">
          <span class="pulse-dot pulse-active" id="hudPulse"></span>
          <span class="status-text" id="hudStatus">running</span>
        </div>
        <button type="button" class="stop-btn" id="hudStopBtn">Stop Agent</button>
      </div>
      <div class="hud-body">
        <div class="step-line">
          <span>Agent Workspace</span>
          <span id="hudStep">Step 0</span>
        </div>
        <div class="action-line" id="hudAction">Waiting...</div>
        <div class="thought-line" id="hudThought">Initializing agent loop...</div>
      </div>
    `;
    shadow.appendChild(card);
    
    shadow.getElementById("hudStopBtn")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "STOP_AGENT" }).catch(() => {});
      card.style.opacity = "0.6";
      const stopBtn = shadow.getElementById("hudStopBtn") as HTMLButtonElement;
      if (stopBtn) {
        stopBtn.disabled = true;
        stopBtn.textContent = "Stopping...";
      }
    });
    
    document.documentElement.appendChild(root);
  }

  const shadow = root.shadowRoot!;
  const status = payload.status || "running";
  const step = payload.step ?? 0;
  const action = payload.lastAction || "None";
  const thought = payload.lastThought || "";

  const hudStatus = shadow.getElementById("hudStatus")!;
  const hudPulse = shadow.getElementById("hudPulse")!;
  const hudStep = shadow.getElementById("hudStep")!;
  const hudAction = shadow.getElementById("hudAction")!;
  const hudThought = shadow.getElementById("hudThought")!;
  const hudStopBtn = shadow.getElementById("hudStopBtn") as HTMLButtonElement;

  hudStatus.textContent = status;
  hudStep.textContent = `Step ${step}`;
  hudAction.textContent = action;
  hudThought.textContent = thought ? `"${thought}"` : "";

  let pulseColor = "#3b82f6";
  if (status === "thinking") pulseColor = "#a855f7";
  if (status === "acting") pulseColor = "#10b981";
  if (status === "retrying") pulseColor = "#f59e0b";
  
  if (status === "done") {
    pulseColor = "#10b981";
    hudPulse.classList.remove("pulse-active");
    if (hudStopBtn) hudStopBtn.style.display = "none";
  } else if (status === "error" || status === "stopped" || status === "blocked") {
    pulseColor = "#ef4444";
    hudPulse.classList.remove("pulse-active");
    if (hudStopBtn) hudStopBtn.style.display = "none";
  } else {
    hudPulse.classList.add("pulse-active");
    if (hudStopBtn) {
      hudStopBtn.style.display = "block";
      hudStopBtn.disabled = false;
      hudStopBtn.textContent = "Stop Agent";
    }
  }
  hudPulse.style.backgroundColor = pulseColor;
}

function waitForStabilization(timeout = 3000, stabilityMs = 200) {
  return new Promise((resolve) => {
    let timeoutId: any;
    let stabilityTimer: any;

    const observer = new MutationObserver(() => {
      clearTimeout(stabilityTimer);
      stabilityTimer = setTimeout(onStable, stabilityMs);
    });

    function onStable() {
      observer.disconnect();
      clearTimeout(timeoutId);
      resolve({ ok: true, stable: true });
    }

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });

    stabilityTimer = setTimeout(onStable, stabilityMs);

    timeoutId = setTimeout(() => {
      observer.disconnect();
      resolve({ ok: true, stable: false, timeout: true });
    }, timeout);
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "WAIT_FOR_STABILIZATION") {
    waitForStabilization(message.timeout, message.stabilityMs).then(sendResponse);
    return true;
  }
  if (message.type === "SNAPSHOT") {
    prevSnapshot = null; // Reset prevSnapshot on full snapshot request
    buildSnapshot(message.withMarkers).then(sendResponse);
    return true;
  }
  if (message.type === "SNAPSHOT_DIFF") {
    buildSnapshotDiff(message.lastActionRect).then(sendResponse);
    return true;
  }
  if (message.type === "CLEAR_MARKERS") {
    clearMarkers();
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "EXECUTE_ACTION") {
    executeAction(message).then(sendResponse);
    return true;
  }
  if (message.type === "AGENT_OVERLAY") {
    updateOverlay(message);
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
