import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { storeMemory, queryMemory, storeLearntRule, queryLearntRules } from './memory-worker';

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
      },
      {
        name: "store_learnt_rule",
        description: "Store an extracted layout constraint or business guideline for a specific domain.",
        inputSchema: {
          type: "object",
          properties: {
            domain: { type: "string" },
            rule_key: { type: "string" },
            extracted_rule_text: { type: "string" }
          },
          required: ["domain", "rule_key", "extracted_rule_text"]
        }
      },
      {
        name: "query_learnt_rules",
        description: "Query for all extracted rules on a specific domain.",
        inputSchema: {
          type: "object",
          properties: {
            domain: { type: "string" }
          },
          required: ["domain"]
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

  if (name === "store_learnt_rule") {
    storeLearntRule(args?.domain as string, args?.rule_key as string, args?.extracted_rule_text as string);
    return { content: [{ type: "text", text: "Rule stored successfully." }] };
  }

  if (name === "query_learnt_rules") {
    const rules = queryLearntRules(args?.domain as string);
    return { content: [{ type: "text", text: JSON.stringify(rules) }] };
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
