import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { storeMemory, queryMemory } from './memory-worker';

const server = new Server(
  {
    name: "spatial-memory",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "store_memory",
        description: "Store a successful UI action sequence for a specific domain and layout.",
        inputSchema: {
          type: "object",
          properties: {
            domain: { type: "string" },
            goal: { type: "string" },
            layout_hash: { type: "string" },
            winning_action: { type: "string", description: "JSON string of the winning action" }
          },
          required: ["domain", "goal", "layout_hash", "winning_action"]
        }
      },
      {
        name: "query_memory",
        description: "Query for a previously successful UI action sequence given a domain and goal.",
        inputSchema: {
          type: "object",
          properties: {
            domain: { type: "string" },
            goal: { type: "string" }
          },
          required: ["domain", "goal"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "store_memory") {
    storeMemory(args?.domain as string, args?.goal as string, args?.layout_hash as string, args?.winning_action as string);
    return { content: [{ type: "text", text: "Memory stored successfully." }] };
  }

  if (name === "query_memory") {
    const action = queryMemory(args?.domain as string, args?.goal as string);
    if (action) {
      return { content: [{ type: "text", text: action }] };
    } else {
      return { content: [{ type: "text", text: "No matching memory found." }] };
    }
  }

  throw new Error(`Unknown tool requested: ${name}`);
});

async function runMcpServer() {
  console.error("[MCP Server] Starting Spatial Memory MCP Server...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP Server] Successfully connected to transport layer. Ready for agent queries.");
}

runMcpServer().catch(err => {
  console.error("[MCP Server] Fatal error starting server:", err);
  process.exit(1);
});
