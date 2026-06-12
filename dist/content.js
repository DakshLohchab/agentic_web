const k="agentic-browser-overlay";let w=new Map,E=null,O=0;function P(t){if(!t||t.closest("[hidden], template"))return!1;const e=window.getComputedStyle(t);if(e.display==="none"||e.visibility==="hidden"||e.opacity==="0")return!1;const n=t.getBoundingClientRect();return n.width>0&&n.height>0}function j(t){const e=window.getComputedStyle(t);if(e.cursor==="pointer")return!0;if(e.pointerEvents==="none")return!1;if(t.isContentEditable||t.hasAttribute("contenteditable"))return!0;const n=t.tagName.toLowerCase(),i=t.getAttribute("role");return!!(["button","input","select","textarea","a"].includes(n)||["button","link","menuitem","textbox","combobox","searchbox"].includes(i||"")||t.hasAttribute("jsaction")||t.hasAttribute("data-trackingid")||t.hasAttribute("guidedhelpid")||t.getAttribute("tabindex")==="0"&&!["a","button","input","textarea","select"].includes(t.tagName.toLowerCase())||t.onclick||t.hasAttribute("onclick")||t.hasAttribute("@click")||t.hasAttribute("v-on:click"))}function I(t){var l;const e=t.getAttribute("aria-label");if(e)return e.trim();const n=t.getAttribute("data-tooltip");if(n)return n.trim();const i=t.getAttribute("data-value");if(i)return i.trim();if(t.id){const f=document.querySelector(`label[for="${CSS.escape(t.id)}"]`);if(f)return((l=f.textContent)==null?void 0:l.trim())||""}const c=t.tagName.toLowerCase();return c==="input"||c==="textarea"?(t.value||t.getAttribute("placeholder")||"").trim():(t.innerText||t.textContent||t.value||"").trim().replace(/\s+/g," ")}function D(t){const e=t.tagName.toLowerCase();return e==="input"||e==="textarea"||e==="select"?t.value||"":t.isContentEditable?(t.innerText||t.textContent||"").trim():""}function N(t,e){const n=(t||"").toLowerCase(),i=e.type||"";return/\b(check-?out\s*date|check-?in)\b/i.test(n)||/\bcheck-?out\b/i.test(n)&&/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mon|tue|wed|thu|fri|sat|sun)\b/i.test(n)||e.getAttribute("role")==="gridcell"&&/\bcheck-?out\b/i.test(n)?null:/\b(pay\s*now|checkout|purchase|buy\s+now|place\s+order|add\s+payment|credit\s*card)\b/i.test(n)||i==="submit"&&/\b(pay|purchase|checkout)\b/i.test(n)?"Payment or checkout blocked. Confirm with user (ask_user) first.":null}function S(t){if((t.getAttribute("type")||"").toLowerCase()==="search")return!0;const n=t.getAttribute("role")||"";if(n==="searchbox"||n==="combobox")return!0;const i=`${t.getAttribute("name")||""} ${t.id||""} ${t.getAttribute("placeholder")||""} ${t.getAttribute("aria-label")||""}`.toLowerCase();return/search|query|\bq\b/.test(i)}function L(t,e){const n=e==="Enter"?"Enter":e,i=e==="Enter"?13:0,c={key:e,code:n,keyCode:i,which:i,bubbles:!0,cancelable:!0};t.dispatchEvent(new KeyboardEvent("keydown",c)),t.dispatchEvent(new KeyboardEvent("keypress",c)),t.dispatchEvent(new KeyboardEvent("keyup",c))}function T(t){var i;L(t,"Enter");const e=t.closest("form");if(e)return typeof e.requestSubmit=="function"?e.requestSubmit():e.submit(),!0;const n=document.querySelector('button#search-icon-legacy, button[aria-label*="Search"], button[aria-label*="search"]')||((i=t.parentElement)==null?void 0:i.querySelector("button"));return n&&(typeof n.click=="function"?n.click():(n.dispatchEvent(new MouseEvent("mousedown",{bubbles:!0,cancelable:!0,view:window})),n.dispatchEvent(new MouseEvent("mouseup",{bubbles:!0,cancelable:!0,view:window})),n.dispatchEvent(new MouseEvent("click",{bubbles:!0,cancelable:!0,view:window})))),!0}function F(t){const e=document.createElement("canvas");e.id="agent-vision-canvas",e.width=window.innerWidth,e.height=window.innerHeight,e.style.position="fixed",e.style.top="0",e.style.left="0",e.style.zIndex="2147483647",e.style.pointerEvents="none",document.documentElement.appendChild(e);const n=e.getContext("2d");return n&&t.forEach(i=>{const{x:c,y:l,w:f,h:s}=i.rect;c<0||l<0||c>window.innerWidth||l>window.innerHeight||(n.strokeStyle="#ff0000",n.lineWidth=2,n.strokeRect(c,l,f,s),n.fillStyle="#ff0000",n.font="12px sans-serif",n.fillText(i.id,c,l>15?l-5:l+15))}),e}function V(){var t;(t=document.getElementById("agent-vision-canvas"))==null||t.remove()}function $(t,e=[]){if(!t)return e;const n=t.querySelectorAll("*");for(const i of Array.from(n))e.push(i),i.shadowRoot&&$(i.shadowRoot,e);return e}function z(){return new Promise(t=>{const e=()=>{requestAnimationFrame(()=>{requestAnimationFrame(()=>{t()})})};document.readyState!=="complete"?(window.addEventListener("load",()=>{e()},{once:!0}),setTimeout(e,250)):e()})}async function B(t=!1){await z(),w=new Map;const n=$(document).filter(r=>P(r)&&j(r)),i=n.filter(r=>{const u=r.getBoundingClientRect();return u.top>=-50&&u.bottom<=window.innerHeight+200}),c=n.filter(r=>!i.includes(r)),l=r=>{const u=r.tagName.toLowerCase(),p=r.getAttribute("role")||"";return["input","textarea","select"].includes(u)||r.isContentEditable||["textbox","searchbox","combobox"].includes(p)||r.hasAttribute("contenteditable")},o=[...[...i.filter(r=>l(r)),...i.filter(r=>!l(r))],...c].slice(0,85).map(r=>{let u=r.getAttribute("data-agent-id");u||(u=`el-${O++}`,r.setAttribute("data-agent-id",u)),w.set(u,r);const p=r.getBoundingClientRect(),b=r.tagName.toLowerCase(),g=I(r).slice(0,80);return{id:u,tag:b,text:g,value:D(r).slice(0,80),placeholder:r.getAttribute("placeholder")||"",type:r.getAttribute("type")||"",href:b==="a"?r.href:"",role:r.getAttribute("role")||"",focused:document.activeElement===r||r.contains(document.activeElement),rect:{x:Math.round(p.left),y:Math.round(p.top),w:Math.round(p.width),h:Math.round(p.height)}}});t&&F(o);const a=o.map(r=>`[${r.id}] ${r.tag} "${r.text}" {x: ${r.rect.x}, y: ${r.rect.y}, w: ${r.rect.w}, h: ${r.rect.h}}`).join(`
`),d=o.length*25;return console.log(`[Agentic] Full Snapshot token estimate: ${d}`),{ok:!0,title:document.title,url:location.href,interactables:o,condensed:a,snapshotTokenEstimate:d}}async function _(t){const e=await B(!1);if(!e.ok)return e;if(!E)return E=e.interactables,{...e,isDiff:!1};const n=e.interactables,i=new Map(E.map(s=>[s.id,s])),c=n.filter(s=>{if(s.tag==="input"||s.tag==="textarea"||s.tag==="select"||s.role==="textbox"||s.role==="searchbox"||s.role==="combobox")return!0;const o=i.get(s.id);if(!o||o.value!==s.value||o.text!==s.text)return!0;if(t){const a=Math.max(0,t.x-(s.rect.x+s.rect.w),s.rect.x-(t.x+t.w)),d=Math.max(0,t.y-(s.rect.y+s.rect.h),s.rect.y-(t.y+t.h));if(Math.sqrt(a*a+d*d)<=200)return!0}return!1});E=n;const l=c.map(s=>`[${s.id}] ${s.tag} "${s.text}" {x: ${s.rect.x}, y: ${s.rect.y}, w: ${s.rect.w}, h: ${s.rect.h}}`).join(`
`),f=c.length*25;return console.log(`[Agentic] Diff Snapshot token estimate: ${f} (Unchanged: ${n.length-c.length})`),{ok:!0,title:e.title,url:e.url,interactables:c,condensed:l,isDiff:!0,unchangedCount:n.length-c.length,snapshotTokenEstimate:f}}function v(t,e,n){var f;if(t&&w.has(t))return w.get(t)||null;if(!((f=e==null?void 0:e.interactables)!=null&&f.length))return null;const i=e.interactables.find(s=>s.id===t);if(i){const s=e.interactables.find(o=>o.text===i.text&&o.placeholder===i.placeholder&&o.tag===i.tag);if(s&&w.has(s.id))return w.get(s.id)||null}const c=((n==null?void 0:n.value)||(n==null?void 0:n.matchText)||"").toLowerCase().trim();if(c){let s=null,o=0;for(const a of e.interactables){const d=w.get(a.id);if(!d)continue;const r=`${a.text} ${a.placeholder} ${a.role}`.toLowerCase();if(!r.includes(c)&&!c.split(/\s+/).every(p=>r.includes(p)))continue;const u=r===c?100:r.includes(c)?50:25;u>o&&(o=u,s=d)}if(s)return s;if(c&&!s){for(const a of e.interactables){const d=w.get(a.id);if(!d)continue;const r=(d.innerText||d.textContent||"").toLowerCase().trim();if(r===c||r.startsWith(c)){s=d;break}}if(s)return s}}const l=e.interactables.find(s=>s.tag==="button"||s.role==="button");return l&&w.get(l.id)||null}function R(t){const e=(t||"down").toLowerCase(),n=window.innerHeight*.85;return e==="up"?window.scrollBy(0,-n):e==="top"?window.scrollTo(0,0):e==="bottom"?window.scrollTo(0,document.body.scrollHeight):window.scrollBy(0,n),{ok:!0}}function C(t){const e=(t||"").toLowerCase();let n=document.body.innerText||"";if(e&&(e.includes("price")||e.includes("cost")||e.includes("total"))){const i=/(?:Rs\.?|INR|₹|\$)\s*([0-9,]+\.?[0-9]*)/i,c=n.match(i);if(c)return{ok:!0,data:`Extracted Price Fallback: ${c[0]}`}}return e&&(n=n.split(`
`).filter(c=>c.toLowerCase().includes(e)).join(`
`)||n),{ok:!0,data:n.slice(0,8e3)}}function M(t,e){var c,l,f,s,o;if(t.focus(),t.isContentEditable)try{t.focus(),document.execCommand("selectAll",!1),document.execCommand("delete",!1);const a=document.execCommand("insertText",!1,e??""),d=t.textContent||t.innerText||"";if(a&&d.includes(e??""))return;console.warn("execCommand insertText failed or didn't set text, running fallback")}catch(a){console.warn("execCommand insertText threw error, running fallback",a)}if(!t.isContentEditable){const a=t,d=(c=Object.getOwnPropertyDescriptor(a,"value"))==null?void 0:c.set,r=Object.getPrototypeOf(a),u=(l=Object.getOwnPropertyDescriptor(r,"value"))==null?void 0:l.set;d&&d!==u?u==null||u.call(a,""):u?u.call(a,""):a.value=""}else t.textContent="";const i=(e??"").split("");for(const a of i){const d={key:a,char:a,keyCode:a.charCodeAt(0),bubbles:!0,cancelable:!0};if(t.dispatchEvent(new KeyboardEvent("keydown",d)),t.dispatchEvent(new KeyboardEvent("keypress",d)),t.isContentEditable)t.textContent+=a;else{const r=t,u=(f=Object.getOwnPropertyDescriptor(r,"value"))==null?void 0:f.set,p=Object.getPrototypeOf(r),b=(s=Object.getOwnPropertyDescriptor(p,"value"))==null?void 0:s.set,g=(o=Object.getOwnPropertyDescriptor(p,"value"))==null?void 0:o.get,h=g?g.call(r):r.value;u&&u!==b?b==null||b.call(r,h+a):b?b.call(r,h+a):r.value+=a}t.dispatchEvent(new InputEvent("input",{bubbles:!0,inputType:"insertText",data:a})),t.dispatchEvent(new KeyboardEvent("keyup",d))}t.dispatchEvent(new Event("change",{bubbles:!0}))}async function A(t){return new Promise(async e=>{let n=!1,i;const c=new MutationObserver(()=>{n=!0,f(),e(!0)}),l=()=>{n=!0,f(),e(!0)};function f(){c.disconnect(),window.removeEventListener("popstate",l),i&&clearTimeout(i)}c.observe(document.body,{childList:!0,subtree:!0,attributes:!0}),window.addEventListener("popstate",l),i=setTimeout(()=>{n||(f(),e(!1))},1500);try{await t()}catch(s){throw f(),s}})}async function q(t){var s;const{action:e,elementId:n,value:i,url:c,snapshot:l,submit:f}=t;try{switch(e){case"navigate":if(!c)throw new Error("navigate requires url");return window.location.href=c,{ok:!0};case"scroll":if(t.fastPath){const o=t.targetY!==void 0?t.targetY:window.scrollY,a=t.targetX!==void 0?t.targetX:window.scrollX;return window.scrollTo({top:o,left:a,behavior:"instant"}),{ok:!0}}return R(i);case"extract":return C(i);case"press":{const o=v(n,l,t)||document.activeElement;if(!o)throw new Error("No element for press");o.scrollIntoView({block:"center",behavior:"instant"}),o.focus();const a=i||"Enter",d=await A(()=>{a==="Enter"&&S(o)?T(o):L(o,a)}),r={ok:!0,submitted:a==="Enter"};return d||(r.warning="Action dispatched but no resulting DOM layout shift was detected. Verify success."),r}case"click":{const o=v(n,l,t);if(!o)throw new Error(`Element not found: ${n}`);const a=I(o),d=N(a,o);if(d)return{ok:!1,blocked:!0,error:d};o.scrollIntoView({block:"center",behavior:"instant"});const r=o.getBoundingClientRect(),u=Math.round(r.left+r.width/2),p=Math.round(r.top+r.height/2),b=document.elementFromPoint(u,p);b&&!o.contains(b)&&!b.contains(o)&&console.warn(`Element might be obscured by ${b.tagName}. Proceeding anyway to allow DEBUGGER_CLICK to resolve it.`);const g=await A(()=>{typeof o.click=="function"?o.click():(o.dispatchEvent(new MouseEvent("mousedown",{bubbles:!0,cancelable:!0,view:window})),o.dispatchEvent(new MouseEvent("mouseup",{bubbles:!0,cancelable:!0,view:window})),o.dispatchEvent(new MouseEvent("click",{bubbles:!0,cancelable:!0,view:window})))}),h={ok:!0,x:u,y:p,w:Math.round(r.width),h:Math.round(r.height)};return g||(h.warning="Action dispatched but no resulting DOM layout shift was detected. Verify success."),h}case"type":{const o=v(n,l,t);if(!o)throw new Error(`Element not found: ${n}`);const a=/card|cvv|cvc|password|ssn|routing/i,d=(o.getAttribute("placeholder")||"")+(o.getAttribute("name")||"")+o.id;if(a.test(d)&&i)return{ok:!1,error:"Refusing to type into sensitive field"};o.scrollIntoView({block:"center",behavior:"instant"}),o.focus(),await new Promise(y=>setTimeout(y,100));const r=o.getBoundingClientRect(),u=Math.round(r.left+r.width/2),p=Math.round(r.top+r.height/2),b=f!==!1&&(f===!0||S(o)),g=await A(()=>{M(o,i),b&&T(o)}),h={ok:!0,submitted:b,x:u,y:p,w:Math.round(r.width),h:Math.round(r.height)};return g||(h.warning="Action dispatched but no resulting DOM layout shift was detected. Verify success."),h}case"copy_data":{const o=v(n,l,t);let a="";o?a=o.innerText||C(i).data||"":a=C(i).data||"";try{return await navigator.clipboard.writeText(a),{ok:!0,copied:a.slice(0,50)+(a.length>50?"...":"")}}catch(d){return{ok:!1,error:"Clipboard write permission denied or failed: "+d.message}}}case"paste_data":try{const o=await navigator.clipboard.readText(),a=v(n,l,t);if(!a)throw new Error(`Element not found for paste: ${n}`);return a.scrollIntoView({block:"center"}),M(a,o),{ok:!0,pastedLength:o.length}}catch(o){return{ok:!1,error:"Clipboard read permission denied or failed: "+o.message}}case"extract_pdf":try{if(!c&&!i)throw new Error("extract_pdf requires a url or value pointing to the PDF");const d=await(await fetch(c||i)).arrayBuffer();let r="";try{const b=await new Function("url","return import(url)")("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js");b.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";const g=await b.getDocument({data:new Uint8Array(d)}).promise;for(let h=1;h<=g.numPages;h++){const m=await(await g.getPage(h)).getTextContent();r+=m.items.map(x=>x.str).join(" ")+`
`}}catch(u){console.warn("PDF parser utility blocked or failed, using text layout parser fallback",u);const p=new Uint8Array(d);let b="";for(let g=0;g<p.length;g++){const h=p[g];h>=32&&h<=126?b+=String.fromCharCode(h):b+=" "}r=((s=b.replace(/\s+/g," ").match(/[a-zA-Z0-9\s.,?!'"()-]{15,}/g))==null?void 0:s.join(`
`))||"No readable text extracted."}return{ok:!0,text:r.slice(0,15e3)}}catch(o){return{ok:!1,error:"Failed to extract PDF: "+o.message}}default:throw new Error(`Unknown action: ${e}`)}}catch(o){return{ok:!1,error:o.message||String(o)}}}function U(t){var b,g;if(t.visible===!1||!t.running){(b=document.getElementById(k))==null||b.remove();return}let e=document.getElementById(k);if(!e){e=document.createElement("div"),e.id=k,e.setAttribute("aria-live","polite");const h=e.attachShadow({mode:"open"}),y=document.createElement("style");y.textContent=`
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
    `,h.appendChild(y);const m=document.createElement("div");m.className="hud-card",m.innerHTML=`
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
    `,h.appendChild(m),(g=h.getElementById("hudStopBtn"))==null||g.addEventListener("click",()=>{chrome.runtime.sendMessage({type:"STOP_AGENT"}).catch(()=>{}),m.style.opacity="0.6";const x=h.getElementById("hudStopBtn");x&&(x.disabled=!0,x.textContent="Stopping...")}),document.documentElement.appendChild(e)}const n=e.shadowRoot,i=t.status||"running",c=t.step??0,l=t.lastAction||"None",f=t.lastThought||"",s=n.getElementById("hudStatus"),o=n.getElementById("hudPulse"),a=n.getElementById("hudStep"),d=n.getElementById("hudAction"),r=n.getElementById("hudThought"),u=n.getElementById("hudStopBtn");s.textContent=i,a.textContent=`Step ${c}`,d.textContent=l,r.textContent=f?`"${f}"`:"";let p="#3b82f6";i==="thinking"&&(p="#a855f7"),i==="acting"&&(p="#10b981"),i==="retrying"&&(p="#f59e0b"),i==="done"?(p="#10b981",o.classList.remove("pulse-active"),u&&(u.style.display="none")):i==="error"||i==="stopped"||i==="blocked"?(p="#ef4444",o.classList.remove("pulse-active"),u&&(u.style.display="none")):(o.classList.add("pulse-active"),u&&(u.style.display="block",u.disabled=!1,u.textContent="Stop Agent")),o.style.backgroundColor=p}function K(t=3e3,e=200){return new Promise(n=>{let i,c;const l=new MutationObserver(()=>{clearTimeout(c),c=setTimeout(f,e)});function f(){l.disconnect(),clearTimeout(i),n({ok:!0,stable:!0})}l.observe(document.body,{childList:!0,subtree:!0,attributes:!0}),c=setTimeout(f,e),i=setTimeout(()=>{l.disconnect(),n({ok:!0,stable:!1,timeout:!0})},t)})}chrome.runtime.onMessage.addListener((t,e,n)=>t.type==="WAIT_FOR_STABILIZATION"?(K(t.timeout,t.stabilityMs).then(n),!0):t.type==="SNAPSHOT"?(E=null,B(t.withMarkers).then(n),!0):t.type==="SNAPSHOT_DIFF"?(_(t.lastActionRect).then(n),!0):t.type==="CLEAR_MARKERS"?(V(),n({ok:!0}),!1):t.type==="EXECUTE_ACTION"?(q(t).then(n),!0):(t.type==="AGENT_OVERLAY"&&(U(t),n({ok:!0})),!1));
