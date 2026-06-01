import fs from 'fs';
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

WORKERS.forEach(worker => {
  const fullPath = path.join(__dirname, worker);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    content = content.replace(/if\s*\(\s*require\.main\s*===\s*module\s*\)/g, 'if (true /* ESM execution */)');
    fs.writeFileSync(fullPath, content);
    console.log(`Patched ${worker}`);
  }
});
