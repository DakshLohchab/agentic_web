/**
 * File: marketing-mcp-server.ts
 * Role: Model Context Protocol (MCP) Tool Registry for the Diff Engine
 * 
 * Description:
 * This script establishes the critical MCP bridge between the browser extension's 
 * primary LLM agent and the local Competitor Intelligence datastore. 
 * 
 * By exposing the 'get_market_updates' tool, we grant the agent a "God's eye view" 
 * of the competitive landscape. When a user prompts the agent with "Have any of our 
 * competitors changed their pricing recently?", the agent can instantly execute this 
 * local tool, retrieving the full matrix of parsed pricing changes directly from SQLite. 
 * 
 * This completely bypasses the need for the agent to open 10 different tabs, navigate 
 * to 10 different pricing pages, and parse 10 different DOMs in real-time, saving 
 * immense amounts of LLM tokens and latency.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { MarketingDatastore } from './marketing-datastore';

// Initialize the local Competitor Intelligence Datastore
const DB_PATH = './marketing-intelligence.db';
const datastore = new MarketingDatastore(DB_PATH);

/**
 * Initialize the MCP Server instance.
 * Identifies the module capabilities to the extension's primary LLM.
 */
const server = new Server(
  {
    name: "competitor-intelligence-diff-engine",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

/**
 * ListTools Handler
 * 
 * Exposes the precise JSON schema for the 'get_market_updates' tool.
 * The primary agent reads this schema on startup so it knows exactly how to query
 * the overall state of the market without needing complex arguments.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_market_updates",
        description: "Retrieves a comprehensive list of all tracked competitors and their latest pricing/feature configurations from the local cache. Use this tool IMMEDIATELY when the user asks for market updates or pricing changes, entirely bypassing the need to scrape competitor websites manually.",
        inputSchema: {
          type: "object",
          properties: {
            // No strict required parameters needed for a global overview,
            // but we provide an optional filter for targeted inquiries.
            target_company: {
              type: "string",
              description: "Optional. If you only want updates for a specific competitor (e.g., 'Stripe'). Leave undefined to get all market updates."
            }
          },
          required: []
        }
      }
    ]
  };
});

/**
 * CallTool Handler
 * 
 * Intercepts the agent's tool execution requests. It routes the query into the SQLite 
 * wrapper, pulls the competitor histories, and formats them into a tight, contextual 
 * string payload for the LLM to ingest.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "get_market_updates") {
    const targetCompany = args?.target_company as string | undefined;
    
    console.error(`[MCP Server] Intercepted get_market_updates request. Target: ${targetCompany || "ALL"}`);
    
    let records = [];
    if (targetCompany) {
      // Fast path: Exact match lookup
      const record = datastore.getCompetitorRecord(targetCompany);
      if (record) records.push(record);
    } else {
      // Global overview lookup
      records = datastore.getAllMarketUpdates();
    }

    if (records.length === 0) {
      return {
        content: [{ 
          type: "text", 
          text: `No competitor intelligence found in the local cache. You may need to manually seed the database or browse the web directly.` 
        }]
      };
    }

    // Format the SQLite records into a clean, readable summary for the LLM's context window.
    // By surfacing the pricing_tier_json directly, the LLM can construct a comparison matrix.
    const formattedIntelligence = records.map((competitor) => {
      const dateStr = new Date(competitor.last_scraped_timestamp).toLocaleDateString();
      
      return `Competitor: ${competitor.company_name}\n- URL: ${competitor.target_url}\n- Last Scraped: ${dateStr}\n- Extracted Pricing/Features: ${competitor.pricing_tier_json}\n- DOM Hash: ${competitor.page_text_hash}`;
    }).join("\n\n---\n\n");

    return {
      content: [{ 
        type: "text", 
        text: `Found ${records.length} competitor record(s) in the local Diff Engine cache. Use this data to generate a market analysis report:\n\n${formattedIntelligence}` 
      }]
    };
  }

  throw new Error(`Unknown tool requested: ${name}`);
});

/**
 * Bootstraps the MCP server using standard I/O transport.
 * The browser extension's native host processes will spawn this Node script
 * and communicate with it seamlessly via stdin/stdout streams.
 */
async function runMcpServer() {
  console.error("[MCP Server] Starting Competitor Intelligence MCP Server...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP Server] Successfully connected to transport layer. Ready for agent queries.");
}

runMcpServer().catch(err => {
  console.error("[MCP Server] Fatal error starting server:", err);
  process.exit(1);
});
