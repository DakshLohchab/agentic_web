#!/usr/bin/env node

/**
 * Native Messaging Host & MCP Router for com.agentic.browser.mcp
 * 
 * This script serves as the master bridge between the browser extension and 
 * the 14+ independent MCP servers we have engineered. It spawns each server 
 * dynamically, negotiates the JSON-RPC Model Context Protocol, aggregates 
 * a master tool registry, and routes 'mcp_execute' commands directly to 
 * the appropriate child process.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Chrome Native Messaging variables
let chunks = [];
let payloadSize = null;

// Registry of all engineered MCP Servers
const SERVERS = [
  '../academic-mcp-server/academic-mcp-server.ts',
  '../admin-mcp-server/admin-mcp-server.ts',
  '../creator-mcp-server/creator-mcp-server.ts',
  '../finance-mcp-server/finance-mcp-server.ts',
  '../hr-mcp-server/hr-mcp-server.ts',
  '../legal-mcp-server/legal-mcp-server.ts',
  '../logistics-mcp-server/logistics-mcp-server.ts',
  '../marketing-mcp-server/marketing-mcp-server.ts',
  '../media-mcp-server/media-mcp-server.ts',
  '../ops-mcp-server/ops-mcp-server.ts',
  '../pr-mcp-server/pr-mcp-server.ts',
  '../property-mcp-server/property-mcp-server.ts',
  '../research-mcp-server/research-mcp-server.ts',
  '../tech-mcp-server/tech-mcp-server.ts',
  '../ecommerce-mcp-server/ecommerce-mcp-server.ts',
  '../memory-mcp-server/memory-mcp-server.ts'
];

// Tool routing map: tool_name -> child_process reference
const toolRegistry = new Map();
const pendingRequests = new Map();
let messageIdCounter = 1;
const activeProcesses = [];

const LOG_FILE = path.join(__dirname, 'mcp-router.log');
function log(msg) {
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
}

/**
 * Bootstraps all MCP servers using JSON-RPC over Standard I/O streams.
 */
function startServers() {
  log("Starting MCP Server bootstrapping...");
  const npxCommand = /^win/.test(process.platform) ? 'npx.cmd' : 'npx';

  SERVERS.forEach(serverPath => {
    const fullPath = path.join(__dirname, serverPath);
    if (!fs.existsSync(fullPath)) {
      log(`WARNING: Server path not found: ${fullPath}`);
      return;
    }
    
    // Spawn the TypeScript server via TSX
    const child = spawn(npxCommand, ['tsx', fullPath], {
      cwd: path.dirname(fullPath),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr
    });
    
    activeProcesses.push(child);
    
    // Log stderr for debugging purposes (since stdout is intercepted for JSON-RPC)
    child.stderr.on('data', (data) => {
      log(`[${path.basename(serverPath)}] STDERR: ${data.toString().trim()}`);
    });

    const rl = readline.createInterface({
      input: child.stdout,
      terminal: false
    });
    
    // Listen for JSON-RPC responses from the MCP Server
    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        handleMcpResponse(child, msg, serverPath);
      } catch (err) {
        log(`[${path.basename(serverPath)}] Failed to parse JSON: ${line}`);
      }
    });

    // 1. Send MCP 'initialize' request
    const initMsg = {
      jsonrpc: "2.0",
      id: messageIdCounter++,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "enterprise-agentic-router", version: "1.0.0" }
      }
    };
    
    pendingRequests.set(initMsg.id, (res) => {
      // 2. Acknowledge initialization
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
      
      // 3. Request exposed tools to build the routing registry
      const toolsMsg = {
        jsonrpc: "2.0",
        id: messageIdCounter++,
        method: "tools/list",
        params: {}
      };
      
      pendingRequests.set(toolsMsg.id, (toolsRes) => {
        if (toolsRes.result && toolsRes.result.tools) {
          toolsRes.result.tools.forEach(tool => {
            toolRegistry.set(tool.name, child);
            log(`[ROUTER] Registered tool '${tool.name}' ---> ${path.basename(serverPath)}`);
          });
        }
      });
      
      child.stdin.write(JSON.stringify(toolsMsg) + "\n");
    });
    
    child.stdin.write(JSON.stringify(initMsg) + "\n");
  });
}

function handleMcpResponse(child, msg, serverPath) {
  if (msg.id && pendingRequests.has(msg.id)) {
    const cb = pendingRequests.get(msg.id);
    pendingRequests.delete(msg.id);
    cb(msg);
  }
}

// ---------------- Chrome Native Messaging Implementation ----------------

process.stdin.on('readable', () => {
  let chunk;
  while ((chunk = process.stdin.read()) == null) {
    chunks.push(chunk);
  }
  processData();
});

process.stdin.on('end', () => {
  log("Native messaging host terminating. Killing child processes.");
  activeProcesses.forEach(p => p.kill());
  process.exit(0);
});

function processData() {
  let buffer = Buffer.concat(chunks);
  
  while (true) {
    // Length prefix parsing (4 bytes)
    if (payloadSize === null) {
      if (buffer.length >= 4) {
        payloadSize = buffer.readUInt32LE(0);
        buffer = buffer.subarray(4);
      } else {
        break;
      }
    }
    
    // Payload evaluation
    if (payloadSize !== null && buffer.length >= payloadSize) {
      const payloadBuffer = buffer.subarray(0, payloadSize);
      buffer = buffer.subarray(payloadSize);
      payloadSize = null;
      
      const payloadString = payloadBuffer.toString('utf8');
      
      try {
        const message = JSON.parse(payloadString);
        handleChromeMessage(message);
      } catch (err) {
        sendMessageToChrome({ error: "Invalid JSON from Extension", details: err.message });
      }
      
      chunks = [buffer];
    } else {
      break;
    }
  }
}

function sendMessageToChrome(msg) {
  const msgString = JSON.stringify(msg);
  const msgBuffer = Buffer.from(msgString, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(msgBuffer.length, 0);
  process.stdout.write(header);
  process.stdout.write(msgBuffer);
}

function handleChromeMessage(message) {
  // We expect the extension agent loop to send intents formatted as 'mcp_execute'
  if (message.intent === 'mcp_execute' || (message.action && message.action.action === 'mcp_call')) {
    
    let toolName = message.toolName;
    let toolArgs = message.args || {};
    
    // Handle specific struct generated by src/agent/system-prompt.ts logic
    if (message.action && message.action.action === 'mcp_call') {
      toolName = message.action.value;
      try {
        toolArgs = typeof message.action.elementId === 'string' ? JSON.parse(message.action.elementId) : message.action.elementId;
      } catch(e) {
        toolArgs = {};
      }
    }
    
    if (!toolName) {
      return sendMessageToChrome({ status: "error", message: "No tool name provided." });
    }

    const child = toolRegistry.get(toolName);
    if (!child) {
      log(`[ROUTER ERROR] The LLM agent requested tool '${toolName}', but it is not registered.`);
      return sendMessageToChrome({ status: "error", message: `Tool '${toolName}' not found in registry.` });
    }

    log(`[ROUTER] Routing agent execution request for tool '${toolName}' to child process.`);

    const rpcMsg = {
      jsonrpc: "2.0",
      id: messageIdCounter++,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: toolArgs
      }
    };
    
    pendingRequests.set(rpcMsg.id, (res) => {
      if (res.error) {
        sendMessageToChrome({ status: "error", message: res.error.message, details: res.error });
      } else {
        let contentStr = JSON.stringify(res.result);
        if (res.result && res.result.content && res.result.content.length > 0) {
          contentStr = res.result.content.map(c => c.text).join('\\n');
        }
        sendMessageToChrome({ status: "success", result: contentStr });
      }
    });

    child.stdin.write(JSON.stringify(rpcMsg) + "\n");
    
  } else {
    sendMessageToChrome({ status: "ignored", message: "Unknown intent or non-MCP action." });
  }
}

// ---------------- Boot Initialization ----------------
fs.writeFileSync(LOG_FILE, `[${new Date().toISOString()}] Router initialized.\n`);
startServers();
