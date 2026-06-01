/**
 * File: pr-mcp-server.ts
 * Role: Model Context Protocol (MCP) Tool Registry for PR Automation
 * 
 * Description:
 * This script establishes the critical MCP bridge between the browser extension's 
 * LLM agent and the local Media Monitoring datastore. 
 * 
 * By exposing the 'generate_pitch_context' tool with an explicit JSON schema, we arm
 * the agent with a "Fast Path" to intelligence. When tasked with emailing a journalist, 
 * the agent can instantly query this local tool to retrieve the journalist's last 3 
 * published articles and their associated sentiment scores. 
 * 
 * This enables the agent to draft highly personalized, hyper-relevant pitch emails 
 * (e.g., "I loved your recent pessimistic take on AI startups...") entirely from local 
 * memory, completely bypassing the massive latency of executing live Google News searches 
 * and manually rendering article tabs.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { PRDatastore } from './pr-datastore';

// Initialize the local PR Datastore connection
const DB_PATH = './pr-mentions.db';
const datastore = new PRDatastore(DB_PATH);

/**
 * Initialize the MCP Server instance.
 * Identifies the module capabilities to the extension's primary LLM.
 */
const server = new Server(
  {
    name: "pr-media-monitoring",
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
 * Exposes the precise JSON schema for the 'generate_pitch_context' tool.
 * The primary agent reads this schema on startup so it knows exactly what parameters
 * to pass when drafting a personalized email.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_pitch_context",
        description: "Retrieves the historical article coverage for a specific journalist. Use this tool IMMEDIATELY before drafting a PR pitch email to personalize the message based on their last 3 articles, bypassing the need to search the web manually.",
        inputSchema: {
          type: "object",
          properties: {
            journalist_name: {
              type: "string",
              description: "The full name of the target journalist (e.g., 'John Doe', 'Jane Smith')."
            }
          },
          required: ["journalist_name"]
        }
      }
    ]
  };
});

/**
 * CallTool Handler
 * 
 * Intercepts the agent's tool execution requests. It routes the 'journalist_name' 
 * argument directly into the SQLite wrapper, pulls the 3 most recent articles, 
 * and formats them into a tight, contextual string payload for the LLM to ingest.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "generate_pitch_context") {
    const journalistName = args?.journalist_name as string;
    
    if (!journalistName) {
      throw new Error("Missing required argument: 'journalist_name'");
    }

    console.error(`[MCP Server] Intercepted pitch context request for journalist: ${journalistName}`);
    
    // Execute the ultra-fast local query to grab the last 3 articles
    const history = datastore.getJournalistHistory(journalistName, 3);

    if (history.length === 0) {
      return {
        content: [{ 
          type: "text", 
          text: `No recent articles found for journalist: '${journalistName}'. You may need to perform a live web search or use a generic pitch.` 
        }]
      };
    }

    // Format the SQLite records into a clean, readable summary for the LLM's context window
    const formattedHistory = history.map((article, index) => {
      const dateStr = new Date(article.publication_date).toLocaleDateString();
      const sentimentLabel = article.sentiment_score > 0.5 ? "Positive" : (article.sentiment_score < -0.5 ? "Negative" : "Neutral");
      
      return `Article ${index + 1}:\n- Outlet: ${article.outlet}\n- Published: ${dateStr}\n- Sentiment: ${sentimentLabel} (${article.sentiment_score})\n- URL: ${article.article_url}`;
    }).join("\n\n");

    return {
      content: [{ 
        type: "text", 
        text: `Found ${history.length} recent article(s) authored by ${journalistName}. Use these to heavily personalize your email pitch:\n\n${formattedHistory}` 
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
  console.error("[MCP Server] Starting PR & Media Monitoring MCP Server...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP Server] Successfully connected to transport layer. Ready for agent queries.");
}

runMcpServer().catch(err => {
  console.error("[MCP Server] Fatal error starting server:", err);
  process.exit(1);
});
