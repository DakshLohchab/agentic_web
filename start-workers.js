/**
 * Enterprise Worker Daemon Initialization Script
 * 
 * This script serves as the centralized orchestrator to launch all background 
 * polling workers for the agentic extension.
 * 
 * Usage: node start-workers.js
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKERS = [
  './academic-mcp-server/academic-worker.ts',
  './admin-mcp-server/admin-worker.ts',
  './creator-mcp-server/creator-worker.ts',
  './finance-mcp-server/finance-worker.ts',
  './hr-mcp-server/hr-worker.ts',
  './legal-mcp-server/legal-worker.ts',
  './logistics-mcp-server/logistics-worker.ts',
  './marketing-mcp-server/marketing-worker.ts',
  './media-mcp-server/media-worker.ts',
  './ops-mcp-server/ops-worker.ts',
  './pr-mcp-server/pr-worker.ts',
  './property-mcp-server/property-worker.ts',
  './research-mcp-server/research-worker.ts',
  './tech-mcp-server/tech-worker.ts'
];

const npxCommand = /^win/.test(process.platform) ? 'npx.cmd' : 'npx';

console.log("==========================================");
console.log("   BOOTING ENTERPRISE WORKER DAEMONS      ");
console.log("==========================================");

WORKERS.forEach(workerPath => {
  const fullPath = path.join(__dirname, workerPath);
  
  const child = spawn(npxCommand, ['tsx', fullPath], {
    cwd: path.dirname(fullPath),
    env: process.env,
    stdio: 'inherit' // Print all logs directly to the main terminal
  });
  
  child.on('error', (err) => {
    console.error(`[ERROR] Failed to start worker ${workerPath}:`, err.message);
  });
});

console.log("\n[DAEMON] All background cron workers have been spawned successfully.");
console.log("[DAEMON] Press Ctrl+C to terminate all background jobs.\n");
