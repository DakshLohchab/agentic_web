export async function detectAndClearOverlays(tabId: number): Promise<{ cleared: boolean; details: string[] }> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const details: string[] = [];
        let cleared = false;
        
        function isLargeBackdrop(el: HTMLElement): boolean {
          const style = window.getComputedStyle(el);
          if (style.position !== 'fixed' && style.position !== 'absolute') return false;
          
          const rect = el.getBoundingClientRect();
          const vWidth = window.innerWidth;
          const vHeight = window.innerHeight;
          const area = rect.width * rect.height;
          const vArea = vWidth * vHeight;
          
          // Covering more than 80% of screen and has some z-index
          return (area / vArea) > 0.8 && parseInt(style.zIndex || '0', 10) > 99;
        }

        function hasCookieKeywords(el: HTMLElement): boolean {
          const text = (el.innerText || '').toLowerCase();
          const keywords = ['accept cookies', 'privacy policy', 'subscribe to our newsletter', 'dismiss', 'cookie consent'];
          
          if (el.tagName.toLowerCase() === 'body' || el.tagName.toLowerCase() === 'html') return false;
          if (text.length > 5000) return false; 
          
          return keywords.some(kw => text.includes(kw));
        }

        function restoreScrolling() {
          let restored = false;
          
          if (document.body.style.overflow === 'hidden' || window.getComputedStyle(document.body).overflow === 'hidden') {
            document.body.style.setProperty('overflow', 'auto', 'important');
            restored = true;
          }
          if (document.documentElement.style.overflow === 'hidden' || window.getComputedStyle(document.documentElement).overflow === 'hidden') {
            document.documentElement.style.setProperty('overflow', 'auto', 'important');
            restored = true;
          }
          
          if (restored) {
            details.push("Restored document overflow to auto to enable scrolling");
            cleared = true;
          }
        }

        const potentialOverlays: HTMLElement[] = [];
        const allElements = document.querySelectorAll('*');
        
        for (let i = 0; i < allElements.length; i++) {
          const el = allElements[i] as HTMLElement;
          const tagName = el.tagName.toLowerCase();
          const role = el.getAttribute('role');
          if (tagName === 'header' || tagName === 'nav' || tagName === 'aside' || role === 'banner' || role === 'navigation') continue;

          const style = window.getComputedStyle(el);
          
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

          const zIndex = parseInt(style.zIndex, 10);
          const isFloating = style.position === 'fixed' || style.position === 'absolute' || style.position === 'sticky';
          
          if (isFloating && !isNaN(zIndex) && zIndex > 999) {
            potentialOverlays.push(el);
          } else if (isFloating && hasCookieKeywords(el)) {
             potentialOverlays.push(el);
          } else if (isLargeBackdrop(el)) {
            potentialOverlays.push(el);
          }
        }

        // Filter out descendants so we only interact with the top-most overlay wrapper
        const topLevelOverlays = potentialOverlays.filter(el => {
          return !potentialOverlays.some(parent => parent !== el && parent.contains(el));
        });

        for (const overlay of topLevelOverlays) {
          let idStr = overlay.tagName.toLowerCase();
          if (overlay.id) idStr += `#${overlay.id}`;
          else if (overlay.className && typeof overlay.className === 'string') {
            idStr += `.${overlay.className.split(' ')[0]}`;
          }
          
          // Attempt programmatic dismissal
          const buttons = Array.from(overlay.querySelectorAll('button, a, [role="button"], .close, .dismiss'));
          let clicked = false;
          
          for (const btn of buttons) {
            const btnText = ((btn as HTMLElement).innerText || '').toLowerCase();
            const btnAria = btn.getAttribute('aria-label')?.toLowerCase() || '';
            if (
              btnText.includes('close') || 
              btnText.includes('dismiss') || 
              btnText.includes('accept') ||
              btnText.includes('agree') ||
              btnText.includes('got it') ||
              btnText.includes('no thanks') ||
              btnAria.includes('close') || 
              btnText === 'x' ||
              btnText === '✕'
            ) {
              try {
                (btn as HTMLElement).click();
                clicked = true;
                details.push(`Clicked dismiss button on overlay ${idStr}`);
                cleared = true;
                break;
              } catch (e) {
                // Ignore click errors
              }
            }
          }

          if (!clicked) {
            // Nuke the overlay via CSS
            overlay.style.setProperty('display', 'none', 'important');
            overlay.style.setProperty('visibility', 'hidden', 'important');
            overlay.style.setProperty('opacity', '0', 'important');
            overlay.style.setProperty('pointer-events', 'none', 'important');
            details.push(`Hid blocking overlay container ${idStr}`);
            cleared = true;
          }
        }

        if (cleared) {
          restoreScrolling();
        }

        return { cleared, details };
      }
    });

    return results[0].result as { cleared: boolean; details: string[] };
  } catch (err: any) {
    if (err.message && err.message.includes('No tab with id')) {
      return { cleared: false, details: ["Tab not found"] };
    }
    console.warn("Overlay nuker warning:", err.message || err);
    return { cleared: false, details: [`Error injecting overlay nuker: ${err.message || err}`] };
  }
}
