const v="agentic-browser-overlay";let h=new Map,g=null,I=0;function B(t){if(!t||t.closest("[hidden], template"))return!1;const e=window.getComputedStyle(t);if(e.display==="none"||e.visibility==="hidden"||e.opacity==="0")return!1;const n=t.getBoundingClientRect();return n.width>0&&n.height>0}function L(t){const e=window.getComputedStyle(t);if(e.cursor==="pointer")return!0;if(e.pointerEvents==="none")return!1;if(t.isContentEditable||t.hasAttribute("contenteditable"))return!0;const n=t.tagName.toLowerCase(),r=t.getAttribute("role");return!!(["button","input","select","textarea","a"].includes(n)||["button","link","menuitem","textbox","combobox","searchbox"].includes(r||"")||t.onclick||t.hasAttribute("onclick")||t.hasAttribute("@click")||t.hasAttribute("v-on:click"))}function A(t){var r;const e=t.getAttribute("aria-label");if(e)return e.trim();if(t.id){const s=document.querySelector(`label[for="${CSS.escape(t.id)}"]`);if(s)return((r=s.textContent)==null?void 0:r.trim())||""}const n=t.tagName.toLowerCase();return n==="input"||n==="textarea"?(t.value||t.getAttribute("placeholder")||"").trim():(t.innerText||t.textContent||t.value||"").trim().replace(/\s+/g," ")}function N(t){const e=t.tagName.toLowerCase();return e==="input"||e==="textarea"||e==="select"?t.value||"":t.isContentEditable?(t.innerText||t.textContent||"").trim():""}function z(t,e){const n=(t||"").toLowerCase(),r=e.type||"";return/\b(pay\s*now|checkout|purchase|buy\s+now|place\s+order|add\s+payment|credit\s*card)\b/i.test(n)||r==="submit"&&/\b(pay|purchase|checkout)\b/i.test(n)?"Payment or checkout blocked. Confirm with user (ask_user) first.":null}function C(t){if((t.getAttribute("type")||"").toLowerCase()==="search")return!0;const n=t.getAttribute("role")||"";if(n==="searchbox"||n==="combobox")return!0;const r=`${t.getAttribute("name")||""} ${t.id||""} ${t.getAttribute("placeholder")||""} ${t.getAttribute("aria-label")||""}`.toLowerCase();return/search|query|\bq\b/.test(r)}function T(t,e){const n=e==="Enter"?"Enter":e,r=e==="Enter"?13:0,s={key:e,code:n,keyCode:r,which:r,bubbles:!0,cancelable:!0};t.dispatchEvent(new KeyboardEvent("keydown",s)),t.dispatchEvent(new KeyboardEvent("keypress",s)),t.dispatchEvent(new KeyboardEvent("keyup",s))}function S(t){var r;T(t,"Enter");const e=t.closest("form");if(e)return typeof e.requestSubmit=="function"?e.requestSubmit():e.submit(),!0;const n=document.querySelector('button#search-icon-legacy, button[aria-label*="Search"], button[aria-label*="search"]')||((r=t.parentElement)==null?void 0:r.querySelector("button"));return n&&(typeof n.click=="function"?n.click():(n.dispatchEvent(new MouseEvent("mousedown",{bubbles:!0,cancelable:!0,view:window})),n.dispatchEvent(new MouseEvent("mouseup",{bubbles:!0,cancelable:!0,view:window})),n.dispatchEvent(new MouseEvent("click",{bubbles:!0,cancelable:!0,view:window})))),!0}function P(t){const e=document.createElement("canvas");e.id="agent-vision-canvas",e.width=window.innerWidth,e.height=window.innerHeight,e.style.position="fixed",e.style.top="0",e.style.left="0",e.style.zIndex="2147483647",e.style.pointerEvents="none",document.documentElement.appendChild(e);const n=e.getContext("2d");return n&&t.forEach(r=>{const{x:s,y:l,w:d,h:o}=r.rect;s<0||l<0||s>window.innerWidth||l>window.innerHeight||(n.strokeStyle="#ff0000",n.lineWidth=2,n.strokeRect(s,l,d,o),n.fillStyle="#ff0000",n.font="12px sans-serif",n.fillText(r.id,s,l>15?l-5:l+15))}),e}function R(){var t;(t=document.getElementById("agent-vision-canvas"))==null||t.remove()}function M(t,e=[]){if(!t)return e;const n=t.querySelectorAll("*");for(const r of Array.from(n))e.push(r),r.shadowRoot&&M(r.shadowRoot,e);return e}function q(){return new Promise(t=>{const e=()=>{requestAnimationFrame(()=>{requestAnimationFrame(()=>{t()})})};document.readyState!=="complete"?(window.addEventListener("load",()=>{e()},{once:!0}),setTimeout(e,250)):e()})}async function $(t=!1){await q(),h=new Map;const n=M(document).filter(i=>B(i)&&L(i)),r=n.filter(i=>{const a=i.getBoundingClientRect();return a.top>=-50&&a.bottom<=window.innerHeight+200}),s=n.filter(i=>!r.includes(i)),l=i=>{const a=i.tagName.toLowerCase(),b=i.getAttribute("role")||"";return["input","textarea","select"].includes(a)||i.isContentEditable||["textbox","searchbox","combobox"].includes(b)||i.hasAttribute("contenteditable")},c=[...[...r.filter(i=>l(i)),...r.filter(i=>!l(i))],...s].slice(0,85).map(i=>{let a=i.getAttribute("data-agent-id");a||(a=`el-${I++}`,i.setAttribute("data-agent-id",a)),h.set(a,i);const b=i.getBoundingClientRect(),p=i.tagName.toLowerCase(),w=A(i).slice(0,80);return{id:a,tag:p,text:w,value:N(i).slice(0,80),placeholder:i.getAttribute("placeholder")||"",type:i.getAttribute("type")||"",href:p==="a"?i.href:"",role:i.getAttribute("role")||"",focused:document.activeElement===i||i.contains(document.activeElement),rect:{x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)}}});t&&P(c);const f=c.map(i=>`[${i.id}] ${i.tag} "${i.text}" {x: ${i.rect.x}, y: ${i.rect.y}, w: ${i.rect.w}, h: ${i.rect.h}}`).join(`
`),u=c.length*25;return console.log(`[Agentic] Full Snapshot token estimate: ${u}`),{ok:!0,title:document.title,url:location.href,interactables:c,condensed:f,snapshotTokenEstimate:u}}async function F(t){const e=await $(!1);if(!e.ok)return e;if(!g)return g=e.interactables,{...e,isDiff:!1};const n=e.interactables,r=new Map(g.map(o=>[o.id,o])),s=n.filter(o=>{if(o.tag==="input"||o.tag==="textarea"||o.tag==="select"||o.role==="textbox"||o.role==="searchbox"||o.role==="combobox")return!0;const c=r.get(o.id);if(!c||c.value!==o.value||c.text!==o.text)return!0;if(t){const f=Math.max(0,t.x-(o.rect.x+o.rect.w),o.rect.x-(t.x+t.w)),u=Math.max(0,t.y-(o.rect.y+o.rect.h),o.rect.y-(t.y+t.h));if(Math.sqrt(f*f+u*u)<=200)return!0}return!1});g=n;const l=s.map(o=>`[${o.id}] ${o.tag} "${o.text}" {x: ${o.rect.x}, y: ${o.rect.y}, w: ${o.rect.w}, h: ${o.rect.h}}`).join(`
`),d=s.length*25;return console.log(`[Agentic] Diff Snapshot token estimate: ${d} (Unchanged: ${n.length-s.length})`),{ok:!0,title:e.title,url:e.url,interactables:s,condensed:l,isDiff:!0,unchangedCount:n.length-s.length,snapshotTokenEstimate:d}}function E(t,e,n){var d;if(t&&h.has(t))return h.get(t)||null;if(!((d=e==null?void 0:e.interactables)!=null&&d.length))return null;const r=e.interactables.find(o=>o.id===t);if(r){const o=e.interactables.find(c=>c.text===r.text&&c.placeholder===r.placeholder&&c.tag===r.tag);if(o&&h.has(o.id))return h.get(o.id)||null}const s=((n==null?void 0:n.value)||(n==null?void 0:n.matchText)||"").toLowerCase().trim();if(s){let o=null,c=0;for(const f of e.interactables){const u=h.get(f.id);if(!u)continue;const i=`${f.text} ${f.placeholder} ${f.role}`.toLowerCase();if(!i.includes(s)&&!s.split(/\s+/).every(b=>i.includes(b)))continue;const a=i===s?100:i.includes(s)?50:25;a>c&&(c=a,o=u)}if(o)return o}const l=e.interactables.find(o=>o.tag==="button"||o.role==="button");return l&&h.get(l.id)||null}function V(t){const e=(t||"down").toLowerCase(),n=window.innerHeight*.85;return e==="up"?window.scrollBy(0,-n):e==="top"?window.scrollTo(0,0):e==="bottom"?window.scrollTo(0,document.body.scrollHeight):window.scrollBy(0,n),{ok:!0}}function O(t){const e=(t||"").toLowerCase();let n=document.body.innerText||"";if(e&&(e.includes("price")||e.includes("cost")||e.includes("total"))){const r=/(?:Rs\.?|INR|₹|\$)\s*([0-9,]+\.?[0-9]*)/i,s=n.match(r);if(s)return{ok:!0,data:`Extracted Price Fallback: ${s[0]}`}}return e&&(n=n.split(`
`).filter(s=>s.toLowerCase().includes(e)).join(`
`)||n),{ok:!0,data:n.slice(0,8e3)}}function _(t,e){if(t.focus(),t.isContentEditable)try{t.focus(),document.execCommand("selectAll",!1),document.execCommand("delete",!1);const r=document.execCommand("insertText",!1,e??""),s=t.textContent||t.innerText||"";if(r&&s.includes(e??""))return;console.warn("execCommand insertText failed or didn't set text, running fallback")}catch(r){console.warn("execCommand insertText threw error, running fallback",r)}t.isContentEditable?t.textContent="":t.value="";const n=(e??"").split("");for(const r of n){const s={key:r,char:r,keyCode:r.charCodeAt(0),bubbles:!0,cancelable:!0};t.dispatchEvent(new KeyboardEvent("keydown",s)),t.dispatchEvent(new KeyboardEvent("keypress",s)),t.isContentEditable?t.textContent+=r:t.value+=r,t.dispatchEvent(new InputEvent("input",{bubbles:!0,inputType:"insertText",data:r})),t.dispatchEvent(new KeyboardEvent("keyup",s))}t.dispatchEvent(new Event("change",{bubbles:!0}))}async function H(t){const{action:e,elementId:n,value:r,url:s,snapshot:l,submit:d}=t;try{switch(e){case"navigate":if(!s)throw new Error("navigate requires url");return window.location.href=s,{ok:!0};case"scroll":return V(r);case"extract":return O(r);case"press":{const o=E(n,l,t)||document.activeElement;if(!o)throw new Error("No element for press");o.scrollIntoView({block:"center"}),o.focus();const c=r||"Enter";return c==="Enter"&&C(o)?S(o):T(o,c),{ok:!0,submitted:c==="Enter"}}case"click":{const o=E(n,l,t);if(!o)throw new Error(`Element not found: ${n}`);const c=A(o),f=z(c,o);if(f)return{ok:!1,blocked:!0,error:f};o.scrollIntoView({block:"center"});const u=o.getBoundingClientRect(),i=Math.round(u.left+u.width/2),a=Math.round(u.top+u.height/2);return typeof o.click=="function"?o.click():(o.dispatchEvent(new MouseEvent("mousedown",{bubbles:!0,cancelable:!0,view:window})),o.dispatchEvent(new MouseEvent("mouseup",{bubbles:!0,cancelable:!0,view:window})),o.dispatchEvent(new MouseEvent("click",{bubbles:!0,cancelable:!0,view:window}))),{ok:!0,x:i,y:a,w:Math.round(u.width),h:Math.round(u.height)}}case"type":{const o=E(n,l,t);if(!o)throw new Error(`Element not found: ${n}`);const c=/card|cvv|cvc|password|ssn|routing/i,f=(o.getAttribute("placeholder")||"")+(o.getAttribute("name")||"")+o.id;if(c.test(f)&&r)return{ok:!1,error:"Refusing to type into sensitive field"};o.scrollIntoView({block:"center"}),o.focus(),await new Promise(p=>setTimeout(p,100));const u=o.getBoundingClientRect(),i=Math.round(u.left+u.width/2),a=Math.round(u.top+u.height/2);return _(o,r),d!==!1&&(d===!0||C(o))?(S(o),{ok:!0,submitted:!0,x:i,y:a,w:Math.round(u.width),h:Math.round(u.height)}):{ok:!0,submitted:!1,x:i,y:a,w:Math.round(u.width),h:Math.round(u.height)}}default:throw new Error(`Unknown action: ${e}`)}}catch(o){return{ok:!1,error:o.message||String(o)}}}function K(t){var p,w;if(t.visible===!1||!t.running){(p=document.getElementById(v))==null||p.remove();return}let e=document.getElementById(v);if(!e){e=document.createElement("div"),e.id=v,e.setAttribute("aria-live","polite");const m=e.attachShadow({mode:"open"}),k=document.createElement("style");k.textContent=`
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
    `,m.appendChild(k);const x=document.createElement("div");x.className="hud-card",x.innerHTML=`
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
    `,m.appendChild(x),(w=m.getElementById("hudStopBtn"))==null||w.addEventListener("click",()=>{chrome.runtime.sendMessage({type:"STOP_AGENT"}).catch(()=>{}),x.style.opacity="0.6";const y=m.getElementById("hudStopBtn");y&&(y.disabled=!0,y.textContent="Stopping...")}),document.documentElement.appendChild(e)}const n=e.shadowRoot,r=t.status||"running",s=t.step??0,l=t.lastAction||"None",d=t.lastThought||"",o=n.getElementById("hudStatus"),c=n.getElementById("hudPulse"),f=n.getElementById("hudStep"),u=n.getElementById("hudAction"),i=n.getElementById("hudThought"),a=n.getElementById("hudStopBtn");o.textContent=r,f.textContent=`Step ${s}`,u.textContent=l,i.textContent=d?`"${d}"`:"";let b="#3b82f6";r==="thinking"&&(b="#a855f7"),r==="acting"&&(b="#10b981"),r==="retrying"&&(b="#f59e0b"),r==="done"?(b="#10b981",c.classList.remove("pulse-active"),a&&(a.style.display="none")):r==="error"||r==="stopped"||r==="blocked"?(b="#ef4444",c.classList.remove("pulse-active"),a&&(a.style.display="none")):(c.classList.add("pulse-active"),a&&(a.style.display="block",a.disabled=!1,a.textContent="Stop Agent")),c.style.backgroundColor=b}function D(t=3e3,e=200){return new Promise(n=>{let r,s;const l=new MutationObserver(()=>{clearTimeout(s),s=setTimeout(d,e)});function d(){l.disconnect(),clearTimeout(r),n({ok:!0,stable:!0})}l.observe(document.body,{childList:!0,subtree:!0,attributes:!0}),s=setTimeout(d,e),r=setTimeout(()=>{l.disconnect(),n({ok:!0,stable:!1,timeout:!0})},t)})}chrome.runtime.onMessage.addListener((t,e,n)=>t.type==="WAIT_FOR_STABILIZATION"?(D(t.timeout,t.stabilityMs).then(n),!0):t.type==="SNAPSHOT"?(g=null,$(t.withMarkers).then(n),!0):t.type==="SNAPSHOT_DIFF"?(F(t.lastActionRect).then(n),!0):t.type==="CLEAR_MARKERS"?(R(),n({ok:!0}),!1):t.type==="EXECUTE_ACTION"?(H(t).then(n),!0):(t.type==="AGENT_OVERLAY"&&(K(t),n({ok:!0})),!1));
