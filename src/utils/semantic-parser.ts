interface Interactable {
  id: string | number;
  tag?: string;
  text?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  [key: string]: any;
}

function getRectDistance(r1: Interactable, r2: Interactable): number {
  const x1 = r1.rect?.x ?? r1.x;
  const y1 = r1.rect?.y ?? r1.y;
  const w1 = r1.rect?.w ?? r1.w;
  const h1 = r1.rect?.h ?? r1.h;

  const x2 = r2.rect?.x ?? r2.x;
  const y2 = r2.rect?.y ?? r2.y;
  const w2 = r2.rect?.w ?? r2.w;
  const h2 = r2.rect?.h ?? r2.h;

  const left = Math.max(x1, x2);
  const right = Math.min(x1 + w1, x2 + w2);
  const top = Math.max(y1, y2);
  const bottom = Math.min(y1 + h1, y2 + h2);

  const horizontalDistance = left < right ? 0 : left - right;
  const verticalDistance = top < bottom ? 0 : top - bottom;

  return Math.sqrt(horizontalDistance * horizontalDistance + verticalDistance * verticalDistance);
}

function findConnectedComponents(elements: Interactable[], threshold: number): Interactable[][] {
  const adj: number[][] = Array.from({ length: elements.length }, () => []);
  
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const elI = elements[i];
      const elJ = elements[j];
      
      const isGridI = elI.role === "gridcell" || elI.role === "calendar" || elI.tag?.toLowerCase() === "td" || (elI.text && /^\s*(0?[1-9]|[12][0-9]|3[01])\s*$/.test(elI.text));
      const isGridJ = elJ.role === "gridcell" || elJ.role === "calendar" || elJ.tag?.toLowerCase() === "td" || (elJ.text && /^\s*(0?[1-9]|[12][0-9]|3[01])\s*$/.test(elJ.text));
      
      if (!isGridI && !isGridJ && getRectDistance(elI, elJ) < threshold) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }

  const visited = new Set<number>();
  const components: Interactable[][] = [];

  for (let i = 0; i < elements.length; i++) {
    if (!visited.has(i)) {
      const comp: Interactable[] = [];
      const queue = [i];
      visited.add(i);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        comp.push(elements[curr]);
        for (const neighbor of adj[curr]) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      components.push(comp);
    }
  }
  
  return components;
}

const isInputTag = (tag?: string, role?: string) => {
  if (role && ["button", "link", "menuitem", "tab"].includes(role.toLowerCase())) return true;
  if (!tag) return false;
  return ["input", "textarea", "select", "button", "form", "a"].includes(tag.toLowerCase());
};

function formatNode(el: Interactable): string {
  const tag = el.tag ? el.tag.charAt(0).toUpperCase() + el.tag.slice(1).toLowerCase() : "Element";
  const textLabel = el.text ? `"${el.text.replace(/\n/g, " ").substring(0, 40).trim()}"` : "";
  return `[ID: ${el.id}] ${tag} ${textLabel}`.trim();
}

export function generateSemanticTree(interactables: any[]): string {
  if (!interactables || !Array.isArray(interactables)) return "";

  const snapshotTokenEstimate = JSON.stringify(interactables).length / 4;
  const isBloated = snapshotTokenEstimate > 8000;

  // Pre-process validElements to associate floating text with nearby icon-only buttons
  for (const el of interactables) {
    const isIconButton = el.tag === 'button' || el.role === 'button';
    if (isIconButton && (!el.text || el.text.trim() === '')) {
      const elX = el.rect?.x ?? el.x;
      const elY = el.rect?.y ?? el.y;
      const elW = el.rect?.w ?? el.w;
      const elH = el.rect?.h ?? el.h;
      
      const elCenterX = elX + elW / 2;
      const elBottom = elY + elH;

      let closestTextEl = null;
      let minDistance = 50; // Max pixels below the icon
      
      for (const other of interactables) {
        if (other !== el && other.text && other.text.trim().length > 0) {
          const otherX = other.rect?.x ?? other.x;
          const otherY = other.rect?.y ?? other.y;
          const otherW = other.rect?.w ?? other.w;
          const otherCenterX = otherX + otherW / 2;
          
          if (otherY >= elBottom && otherY - elBottom < minDistance && Math.abs(elCenterX - otherCenterX) < 30) {
            minDistance = otherY - elBottom;
            closestTextEl = other;
          }
        }
      }
      
      if (closestTextEl) {
        el.text = closestTextEl.text;
        closestTextEl._mergedIntoButton = true;
      }
    }
  }

  // 1. Filter elements
  const validElements = interactables.filter((el) => {
    if (el._mergedIntoButton) return false;

    // Must have visible dimensions
    const w = el.rect?.w ?? el.w;
    const h = el.rect?.h ?? el.h;
    if (w === undefined || h === undefined || w === 0 || h === 0) return false;
    
    // Aggressive Context Pruning: Truncate large text nodes
    if (el.text && el.text.length > 150) {
      el.text = el.text.substring(0, 147) + "...";
    }

    // Explicitly preserve structural buttons or navigation icons (like Maps Directions)
    if (el.ariaLabel || el.title || el.role === 'button' || el.tag === 'button') return true;

    // Aggressive Context Pruning: Filter non-essential elements if bloated
    if (isBloated) {
      const lowerText = (el.text || "").toLowerCase();
      const skipKeywords = ["privacy policy", "terms of service", "cookie", "footer", "about us", "contact us", "careers", "legal"];
      if (skipKeywords.some(k => lowerText.includes(k))) return false;
    }

    // Keep if it has actionable text
    if (el.text && el.text.trim().length > 0) return true;
    // Keep if it's a critical input
    if (isInputTag(el.tag, el.role)) return true;
    return false;
  }) as Interactable[];

  // 2. Cluster close elements (e.g., within 60px of each other)
  // Ensure that structurally important buttons (like navigation controls) are not aggressively collapsed if they are large
  const components = findConnectedComponents(validElements, 60);

  // 3. Sort components top-to-bottom, left-to-right
  components.sort((a, b) => {
    const minYA = Math.min(...a.map(e => e.rect?.y ?? e.y));
    const minYB = Math.min(...b.map(e => e.rect?.y ?? e.y));
    if (Math.abs(minYA - minYB) > 20) return minYA - minYB;
    const minXA = Math.min(...a.map(e => e.rect?.x ?? e.x));
    const minXB = Math.min(...b.map(e => e.rect?.x ?? e.x));
    return minXA - minXB;
  });

  let output = "";
  let containerId = 1;

  for (const comp of components) {
    // Sort elements within component top-to-bottom, left-to-right
    comp.sort((a, b) => {
      const ay = a.rect?.y ?? a.y;
      const by = b.rect?.y ?? b.y;
      if (Math.abs(ay - by) > 10) return ay - by;
      return (a.rect?.x ?? a.x) - (b.rect?.x ?? b.x);
    });

    if (comp.length === 1) {
      output += formatNode(comp[0]) + "\n";
    } else {
      // Determine semantic label
      let containerType = "Section";
      let containerLabel = "Container";
      
      const hasInput = comp.some(e => e.tag && ["input", "textarea", "select", "form"].includes(e.tag.toLowerCase()));
      if (hasInput) {
        containerType = "Form";
        const hintEl = comp.find(e => e.text && e.text.trim().length > 0);
        containerLabel = hintEl?.text ? `${hintEl.text.substring(0, 20).trim()} Form` : "Interactive Form";
      } else {
        containerType = "Card";
        const textNode = comp.find(e => e.text && e.text.trim().length > 0);
        containerLabel = textNode?.text ? `${textNode.text.substring(0, 30).trim()}` : "Grouped Content";
      }

      output += `[ID: c-${containerId++}] ${containerType} "${containerLabel}"\n`;
      for (let i = 0; i < comp.length; i++) {
        const prefix = (i === comp.length - 1) ? "└── " : "├── ";
        output += prefix + formatNode(comp[i]) + "\n";
      }
    }
  }

  return output.trim();
}
