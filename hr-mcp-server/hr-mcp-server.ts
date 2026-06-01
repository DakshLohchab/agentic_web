/**
 * File: hr-mcp-server.ts
 * Role: Model Context Protocol (MCP) Tool Registry
 * 
 * Description:
 * This file sets up the standard MCP Server that acts as a secure bridge between
 * the primary agentic browser extension and the local HR datastore.
 * 
 * By exposing 'query_datastore' as an MCP tool with an explicit JSON schema, we give
 * the LLM the ability to instantly search through hundreds of cached candidates using
 * standard tool-call syntax. This is the "Fast Path" — if the agent needs a React
 * developer, it asks the local database FIRST, receiving an instantaneous response, 
 * entirely avoiding the need to open LinkedIn, render the DOM, and burn LLM tokens
 * parsing UI elements.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { HRDatastore } from './hr-datastore';

// Initialize the local HR Datastore
const DB_PATH = './candidates.db';
const datastore = new HRDatastore(DB_PATH);

/**
 * Initialize the MCP Server instance.
 * The server name and version help the extension's LLM identify the toolset capabilities.
 */
const server = new Server(
  {
    name: "candidate-sourcing-ats",
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
 * Defines the explicit JSON schema for the available tools in this module.
 * The primary agent will read this schema during initialization to understand exactly
 * what arguments it must pass to execute the query.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query_datastore",
        description: "Queries the local SQLite Candidate database for fast ATS filtering. Always use this first before initiating a web search for candidates.",
        inputSchema: {
          type: "object",
          properties: {
            skill: {
              type: "string",
              description: "The technical or soft skill to search for across candidate profiles (e.g., 'TypeScript', 'System Design')."
            }
          },
          required: ["skill"]
        }
      }
    ]
  };
});

/**
 * CallTool Handler
 * 
 * Intercepts tool execution requests from the agentic extension. Validates the tool name
 * and arguments, routes the request to the SQLite wrapper, and returns the result back
 * to the agent in a structured text block.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "query_datastore") {
    // Validate arguments against our schema
    const skill = args?.skill as string;
    
    if (!skill) {
      throw new Error("Missing required argument: 'skill'");
    }

    console.error(`[MCP Server] Intercepted query_datastore tool call for skill: ${skill}`);
    
    // Execute the ultra-fast local query
    const results = datastore.queryCandidatesBySkill(skill);

    if (results.length === 0) {
      return {
        content: [{ 
          type: "text", 
          text: `No candidates found with the skill: '${skill}'. You should fallback to active web scraping.` 
        }]
      };
    }

    // Format the database records into a clean string payload for the LLM
    const formattedResults = results.map(c => 
      `- ${c.candidate_name} (${c.current_role})\n  GitHub: ${c.github_url}\n  Skills: ${c.parsed_skills_json}`
    ).join("\n\n");

    return {
      content: [{ 
        type: "text", 
        text: `Found ${results.length} candidate(s):\n\n${formattedResults}` 
      }]
    };
  }

  throw new Error(`Unknown tool requested: ${name}`);
});

/**
 * Bootstraps the MCP server using standard I/O transport.
 * The browser extension's native host processes will spawn this Node script
 * and communicate with it via stdin/stdout streams.
 */
async function runMcpServer() {
  console.error("[MCP Server] Starting ATS Candidate Sourcing MCP Server...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP Server] Successfully connected to transport layer. Ready for agent queries.");
}

runMcpServer().catch(err => {
  console.error("[MCP Server] Fatal error starting server:", err);
  process.exit(1);
});
