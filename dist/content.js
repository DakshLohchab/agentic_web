const k="agentic-browser-overlay";let g=new Map,E=null,P=0;function N(t){if(!t||t.closest("[hidden], template"))return!1;const e=window.getComputedStyle(t);if(e.display==="none"||e.visibility==="hidden"||e.opacity==="0")return!1;const n=t.getBoundingClientRect();return n.width>0&&n.height>0}function F(t){const e=window.getComputedStyle(t);if(e.cursor==="pointer")return!0;if(e.pointerEvents==="none")return!1;if(t.isContentEditable||t.hasAttribute("contenteditable"))return!0;const n=t.tagName.toLowerCase(),r=t.getAttribute("role");return!!(["button","input","select","textarea","a"].includes(n)||["button","link","menuitem","textbox","combobox","searchbox"].includes(r||"")||t.hasAttribute("jsaction")||t.hasAttribute("data-trackingid")||t.hasAttribute("guidedhelpid")||t.getAttribute("tabindex")==="0"&&!["a","button","input","textarea","select"].includes(t.tagName.toLowerCase())||t.onclick||t.hasAttribute("onclick")||t.hasAttribute("@click")||t.hasAttribute("v-on:click"))}function I(t){var c;const e=t.getAttribute("aria-label");if(e)return e.trim();const n=t.getAttribute("data-tooltip");if(n)return n.trim();const r=t.getAttribute("data-value");if(r)return r.trim();if(t.id){const f=document.querySelector(`label[for="${CSS.escape(t.id)}"]`);if(f)return((c=f.textContent)==null?void 0:c.trim())||""}const s=t.tagName.toLowerCase();return s==="input"||s==="textarea"?(t.value||t.getAttribute("placeholder")||"").trim():(t.innerText||t.textContent||t.value||"").trim().replace(/\s+/g," ")}function j(t){const e=t.tagName.toLowerCase();return e==="input"||e==="textarea"||e==="select"?t.value||"":t.isContentEditable?(t.innerText||t.textContent||"").trim():""}function D(t,e){const n=(t||"").toLowerCase(),r=e.type||"";return/\b(check-?out\s*date|check-?in)\b/i.test(n)||/\bcheck-?out\b/i.test(n)&&/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mon|tue|wed|thu|fri|sat|sun)\b/i.test(n)||e.getAttribute("role")==="gridcell"&&/\bcheck-?out\b/i.test(n)?null:/\b(pay\s*now|checkout|purchase|buy\s+now|place\s+order|add\s+payment|credit\s*card)\b/i.test(n)||r==="submit"&&/\b(pay|purchase|checkout)\b/i.test(n)?"Payment or checkout blocked. Confirm with user (ask_user) first.":null}function S(t){if((t.getAttribute("type")||"").toLowerCase()==="search")return!0;const n=t.getAttribute("role")||"";if(n==="searchbox"||n==="combobox")return!0;const r=`${t.getAttribute("name")||""} ${t.id||""} ${t.getAttribute("placeholder")||""} ${t.getAttribute("aria-label")||""}`.toLowerCase();return/search|query|\bq\b/.test(r)}function L(t,e){const n=e==="Enter"?"Enter":e,r=e==="Enter"?13:0,s={key:e,code:n,keyCode:r,which:r,bubbles:!0,cancelable:!0};t.dispatchEvent(new KeyboardEvent("keydown",s)),t.dispatchEvent(new KeyboardEvent("keypress",s)),t.dispatchEvent(new KeyboardEvent("keyup",s))}function T(t){var r;L(t,"Enter");const e=t.closest("form");if(e)return typeof e.requestSubmit=="function"?e.requestSubmit():e.submit(),!0;const n=document.querySelector('button#search-icon-legacy, button[aria-label*="Search"], button[aria-label*="search"]')||((r=t.parentElement)==null?void 0:r.querySelector("button"));return n&&(typeof n.click=="function"?n.click():(n.dispatchEvent(new MouseEvent("mousedown",{bubbles:!0,cancelable:!0,view:window})),n.dispatchEvent(new MouseEvent("mouseup",{bubbles:!0,cancelable:!0,view:window})),n.dispatchEvent(new MouseEvent("click",{bubbles:!0,cancelable:!0,view:window})))),!0}function O(t){const e=document.createElement("canvas");e.id="agent-vision-canvas",e.width=window.innerWidth,e.height=window.innerHeight,e.style.position="fixed",e.style.top="0",e.style.left="0",e.style.zIndex="2147483647",e.style.pointerEvents="none",document.documentElement.appendChild(e);const n=e.getContext("2d");return n&&t.forEach(r=>{const{x:s,y:c,w:f,h:a}=r.rect;s<0||c<0||s>window.innerWidth||c>window.innerHeight||(n.strokeStyle="#ff0000",n.lineWidth=2,n.strokeRect(s,c,f,a),n.fillStyle="#ff0000",n.font="12px sans-serif",n.fillText(r.id,s,c>15?c-5:c+15))}),e}function V(){var t;(t=document.getElementById("agent-vision-canvas"))==null||t.remove()}function $(t,e=[]){if(!t)return e;const n=t.querySelectorAll("*");for(const r of Array.from(n))e.push(r),r.shadowRoot&&$(r.shadowRoot,e);return e}function z(){return new Promise(t=>{const e=()=>{requestAnimationFrame(()=>{requestAnimationFrame(()=>{t()})})};document.readyState!=="complete"?(window.addEventListener("load",()=>{e()},{once:!0}),setTimeout(e,250)):e()})}async function B(t=!1){await z(),g=new Map;const n=$(document).filter(o=>N(o)&&F(o)),r=n.filter(o=>{const l=o.getBoundingClientRect();return l.top>=-50&&l.bottom<=window.innerHeight+200}),s=n.filter(o=>!r.includes(o)),c=o=>{const l=o.tagName.toLowerCase(),b=o.getAttribute("role")||"";return["input","textarea","select"].includes(l)||o.isContentEditable||["textbox","searchbox","combobox"].includes(b)||o.hasAttribute("contenteditable")},i=[...[...r.filter(o=>c(o)),...r.filter(o=>!c(o))],...s].slice(0,85).map(o=>{let l=o.getAttribute("data-agent-id");l||(l=`el-${P++}`,o.setAttribute("data-agent-id",l)),g.set(l,o);const b=o.getBoundingClientRect(),p=o.tagName.toLowerCase(),w=I(o).slice(0,80);return{id:l,tag:p,text:w,value:j(o).slice(0,80),placeholder:o.getAttribute("placeholder")||"",type:o.getAttribute("type")||"",href:p==="a"?o.href:"",role:o.getAttribute("role")||"",focused:document.activeElement===o||o.contains(document.activeElement),rect:{x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)}}});t&&O(i);const u=i.map(o=>`[${o.id}] ${o.tag} "${o.text}" {x: ${o.rect.x}, y: ${o.rect.y}, w: ${o.rect.w}, h: ${o.rect.h}}`).join(`
`),d=i.length*25;return console.log(`[Agentic] Full Snapshot token estimate: ${d}`),{ok:!0,title:document.title,url:location.href,interactables:i,condensed:u,snapshotTokenEstimate:d}}async function _(t){const e=await B(!1);if(!e.ok)return e;if(!E)return E=e.interactables,{...e,isDiff:!1};const n=e.interactables,r=new Map(E.map(a=>[a.id,a])),s=n.filter(a=>{if(a.tag==="input"||a.tag==="textarea"||a.tag==="select"||a.role==="textbox"||a.role==="searchbox"||a.role==="combobox")return!0;const i=r.get(a.id);if(!i||i.value!==a.value||i.text!==a.text)return!0;if(t){const u=Math.max(0,t.x-(a.rect.x+a.rect.w),a.rect.x-(t.x+t.w)),d=Math.max(0,t.y-(a.rect.y+a.rect.h),a.rect.y-(t.y+t.h));if(Math.sqrt(u*u+d*d)<=200)return!0}return!1});E=n;const c=s.map(a=>`[${a.id}] ${a.tag} "${a.text}" {x: ${a.rect.x}, y: ${a.rect.y}, w: ${a.rect.w}, h: ${a.rect.h}}`).join(`
`),f=s.length*25;return console.log(`[Agentic] Diff Snapshot token estimate: ${f} (Unchanged: ${n.length-s.length})`),{ok:!0,title:e.title,url:e.url,interactables:s,condensed:c,isDiff:!0,unchangedCount:n.length-s.length,snapshotTokenEstimate:f}}function v(t,e,n){var f;if(t&&g.has(t))return g.get(t)||null;if(!((f=e==null?void 0:e.interactables)!=null&&f.length))return null;const r=e.interactables.find(a=>a.id===t);if(r){const a=e.interactables.find(i=>i.text===r.text&&i.placeholder===r.placeholder&&i.tag===r.tag);if(a&&g.has(a.id))return g.get(a.id)||null}const s=((n==null?void 0:n.value)||(n==null?void 0:n.matchText)||"").toLowerCase().trim();if(s){let a=null,i=0;for(const u of e.interactables){const d=g.get(u.id);if(!d)continue;const o=`${u.text} ${u.placeholder} ${u.role}`.toLowerCase();if(!o.includes(s)&&!s.split(/\s+/).every(b=>o.includes(b)))continue;const l=o===s?100:o.includes(s)?50:25;l>i&&(i=l,a=d)}if(a)return a;if(s&&!a){for(const u of e.interactables){const d=g.get(u.id);if(!d)continue;const o=(d.innerText||d.textContent||"").toLowerCase().trim();if(o===s||o.startsWith(s)){a=d;break}}if(a)return a}}const c=e.interactables.find(a=>a.tag==="button"||a.role==="button");return c&&g.get(c.id)||null}function R(t){const e=(t||"down").toLowerCase(),n=window.innerHeight*.85;return e==="up"?window.scrollBy(0,-n):e==="top"?window.scrollTo(0,0):e==="bottom"?window.scrollTo(0,document.body.scrollHeight):window.scrollBy(0,n),{ok:!0}}function C(t){const e=(t||"").toLowerCase();let n=document.body.innerText||"";if(e&&(e.includes("price")||e.includes("cost")||e.includes("total"))){const r=/(?:Rs\.?|INR|₹|\$)\s*([0-9,]+\.?[0-9]*)/i,s=n.match(r);if(s)return{ok:!0,data:`Extracted Price Fallback: ${s[0]}`}}return e&&(n=n.split(`
`).filter(s=>s.toLowerCase().includes(e)).join(`
`)||n),{ok:!0,data:n.slice(0,8e3)}}function M(t,e){if(t.focus(),t.isContentEditable)try{t.focus(),document.execCommand("selectAll",!1),document.execCommand("delete",!1);const r=document.execCommand("insertText",!1,e??""),s=t.textContent||t.innerText||"";if(r&&s.includes(e??""))return;console.warn("execCommand insertText failed or didn't set text, running fallback")}catch(r){console.warn("execCommand insertText threw error, running fallback",r)}t.isContentEditable?t.textContent="":t.value="";const n=(e??"").split("");for(const r of n){const s={key:r,char:r,keyCode:r.charCodeAt(0),bubbles:!0,cancelable:!0};t.dispatchEvent(new KeyboardEvent("keydown",s)),t.dispatchEvent(new KeyboardEvent("keypress",s)),t.isContentEditable?t.textContent+=r:t.value+=r,t.dispatchEvent(new InputEvent("input",{bubbles:!0,inputType:"insertText",data:r})),t.dispatchEvent(new KeyboardEvent("keyup",s))}t.dispatchEvent(new Event("change",{bubbles:!0}))}async function A(t){return new Promise(async e=>{let n=!1,r;const s=new MutationObserver(()=>{n=!0,f(),e(!0)}),c=()=>{n=!0,f(),e(!0)};function f(){s.disconnect(),window.removeEventListener("popstate",c),r&&clearTimeout(r)}s.observe(document.body,{childList:!0,subtree:!0,attributes:!0}),window.addEventListener("popstate",c),r=setTimeout(()=>{n||(f(),e(!1))},1500);try{await t()}catch(a){throw f(),a}})}async function q(t){var a;const{action:e,elementId:n,value:r,url:s,snapshot:c,submit:f}=t;try{switch(e){case"navigate":if(!s)throw new Error("navigate requires url");return window.location.href=s,{ok:!0};case"scroll":if(t.fastPath){const i=t.targetY!==void 0?t.targetY:window.scrollY,u=t.targetX!==void 0?t.targetX:window.scrollX;return window.scrollTo({top:i,left:u,behavior:"instant"}),{ok:!0}}return R(r);case"extract":return C(r);case"press":{const i=v(n,c,t)||document.activeElement;if(!i)throw new Error("No element for press");i.scrollIntoView({block:"center",behavior:"instant"}),i.focus();const u=r||"Enter",d=await A(()=>{u==="Enter"&&S(i)?T(i):L(i,u)}),o={ok:!0,submitted:u==="Enter"};return d||(o.warning="Action dispatched but no resulting DOM layout shift was detected. Verify success."),o}case"click":{const i=v(n,c,t);if(!i)throw new Error(`Element not found: ${n}`);const u=I(i),d=D(u,i);if(d)return{ok:!1,blocked:!0,error:d};i.scrollIntoView({block:"center",behavior:"instant"});const o=i.getBoundingClientRect(),l=Math.round(o.left+o.width/2),b=Math.round(o.top+o.height/2),p=document.elementFromPoint(l,b);p&&!i.contains(p)&&!p.contains(i)&&console.warn(`Element might be obscured by ${p.tagName}. Proceeding anyway to allow DEBUGGER_CLICK to resolve it.`);const w=await A(()=>{typeof i.click=="function"?i.click():(i.dispatchEvent(new MouseEvent("mousedown",{bubbles:!0,cancelable:!0,view:window})),i.dispatchEvent(new MouseEvent("mouseup",{bubbles:!0,cancelable:!0,view:window})),i.dispatchEvent(new MouseEvent("click",{bubbles:!0,cancelable:!0,view:window})))}),h={ok:!0,x:l,y:b,w:Math.round(o.width),h:Math.round(o.height)};return w||(h.warning="Action dispatched but no resulting DOM layout shift was detected. Verify success."),h}case"type":{const i=v(n,c,t);if(!i)throw new Error(`Element not found: ${n}`);const u=/card|cvv|cvc|password|ssn|routing/i,d=(i.getAttribute("placeholder")||"")+(i.getAttribute("name")||"")+i.id;if(u.test(d)&&r)return{ok:!1,error:"Refusing to type into sensitive field"};i.scrollIntoView({block:"center",behavior:"instant"}),i.focus(),await new Promise(x=>setTimeout(x,100));const o=i.getBoundingClientRect(),l=Math.round(o.left+o.width/2),b=Math.round(o.top+o.height/2),p=f!==!1&&(f===!0||S(i)),w=await A(()=>{M(i,r),p&&T(i)}),h={ok:!0,submitted:p,x:l,y:b,w:Math.round(o.width),h:Math.round(o.height)};return w||(h.warning="Action dispatched but no resulting DOM layout shift was detected. Verify success."),h}case"copy_data":{const i=v(n,c,t);let u="";i?u=i.innerText||C(r).data||"":u=C(r).data||"";try{return await navigator.clipboard.writeText(u),{ok:!0,copied:u.slice(0,50)+(u.length>50?"...":"")}}catch(d){return{ok:!1,error:"Clipboard write permission denied or failed: "+d.message}}}case"paste_data":try{const i=await navigator.clipboard.readText(),u=v(n,c,t);if(!u)throw new Error(`Element not found for paste: ${n}`);return u.scrollIntoView({block:"center"}),M(u,i),{ok:!0,pastedLength:i.length}}catch(i){return{ok:!1,error:"Clipboard read permission denied or failed: "+i.message}}case"extract_pdf":try{if(!s&&!r)throw new Error("extract_pdf requires a url or value pointing to the PDF");const d=await(await fetch(s||r)).arrayBuffer();let o="";try{const p=await new Function("url","return import(url)")("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js");p.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";const w=await p.getDocument({data:new Uint8Array(d)}).promise;for(let h=1;h<=w.numPages;h++){const m=await(await w.getPage(h)).getTextContent();o+=m.items.map(y=>y.str).join(" ")+`
`}}catch(l){console.warn("PDF parser utility blocked or failed, using text layout parser fallback",l);const b=new Uint8Array(d);let p="";for(let w=0;w<b.length;w++){const h=b[w];h>=32&&h<=126?p+=String.fromCharCode(h):p+=" "}o=((a=p.replace(/\s+/g," ").match(/[a-zA-Z0-9\s.,?!'"()-]{15,}/g))==null?void 0:a.join(`
`))||"No readable text extracted."}return{ok:!0,text:o.slice(0,15e3)}}catch(i){return{ok:!1,error:"Failed to extract PDF: "+i.message}}default:throw new Error(`Unknown action: ${e}`)}}catch(i){return{ok:!1,error:i.message||String(i)}}}function U(t){var p,w;if(t.visible===!1||!t.running){(p=document.getElementById(k))==null||p.remove();return}let e=document.getElementById(k);if(!e){e=document.createElement("div"),e.id=k,e.setAttribute("aria-live","polite");const h=e.attachShadow({mode:"open"}),x=document.createElement("style");x.textContent=`
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
    `,h.appendChild(x);const m=document.createElement("div");m.className="hud-card",m.innerHTML=`
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
    `,h.appendChild(m),(w=h.getElementById("hudStopBtn"))==null||w.addEventListener("click",()=>{chrome.runtime.sendMessage({type:"STOP_AGENT"}).catch(()=>{}),m.style.opacity="0.6";const y=h.getElementById("hudStopBtn");y&&(y.disabled=!0,y.textContent="Stopping...")}),document.documentElement.appendChild(e)}const n=e.shadowRoot,r=t.status||"running",s=t.step??0,c=t.lastAction||"None",f=t.lastThought||"",a=n.getElementById("hudStatus"),i=n.getElementById("hudPulse"),u=n.getElementById("hudStep"),d=n.getElementById("hudAction"),o=n.getElementById("hudThought"),l=n.getElementById("hudStopBtn");a.textContent=r,u.textContent=`Step ${s}`,d.textContent=c,o.textContent=f?`"${f}"`:"";let b="#3b82f6";r==="thinking"&&(b="#a855f7"),r==="acting"&&(b="#10b981"),r==="retrying"&&(b="#f59e0b"),r==="done"?(b="#10b981",i.classList.remove("pulse-active"),l&&(l.style.display="none")):r==="error"||r==="stopped"||r==="blocked"?(b="#ef4444",i.classList.remove("pulse-active"),l&&(l.style.display="none")):(i.classList.add("pulse-active"),l&&(l.style.display="block",l.disabled=!1,l.textContent="Stop Agent")),i.style.backgroundColor=b}function K(t=3e3,e=200){return new Promise(n=>{let r,s;const c=new MutationObserver(()=>{clearTimeout(s),s=setTimeout(f,e)});function f(){c.disconnect(),clearTimeout(r),n({ok:!0,stable:!0})}c.observe(document.body,{childList:!0,subtree:!0,attributes:!0}),s=setTimeout(f,e),r=setTimeout(()=>{c.disconnect(),n({ok:!0,stable:!1,timeout:!0})},t)})}chrome.runtime.onMessage.addListener((t,e,n)=>t.type==="WAIT_FOR_STABILIZATION"?(K(t.timeout,t.stabilityMs).then(n),!0):t.type==="SNAPSHOT"?(E=null,B(t.withMarkers).then(n),!0):t.type==="SNAPSHOT_DIFF"?(_(t.lastActionRect).then(n),!0):t.type==="CLEAR_MARKERS"?(V(),n({ok:!0}),!1):t.type==="EXECUTE_ACTION"?(q(t).then(n),!0):(t.type==="AGENT_OVERLAY"&&(U(t),n({ok:!0})),!1));
