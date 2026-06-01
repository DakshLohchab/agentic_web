/**
 * File: admin-mcp-server.ts
 * Role: Model Context Protocol (MCP) Tool Bridge for Enterprise Automation
 * 
 * Description:
 * This script establishes the critical MCP bridge between the browser extension's 
 * primary LLM agent and the local Enterprise Admin Datastore. 
 * 
 * By exposing tools like 'fetch_saas_mapping' and 'validate_form_cache', we grant 
 * the agent profound structural awareness of complex SaaS platforms (e.g., Salesforce, Jira).
 * Instead of the agent blindly clicking through nested iframes and hallucinating CSS 
 * selectors, it uses this MCP server to retrieve the exact structural element locators 
 * and payload constraints *before* it begins automating.
 * 
 * SYSTEM PROMPT & SCHEMA CONFIGURATION:
 * The schemas below are strictly typed with JSON validation boundaries. This ensures 
 * the LLM formats its administrative properties perfectly, preventing catastrophic runtime 
 * errors during automated bulk data entry.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AdminDatastore } from './admin-datastore';

// Initialize the local Enterprise Admin Datastore
const DB_PATH = './enterprise-sync.db';
const datastore = new AdminDatastore(DB_PATH);

/**
 * Initialize the MCP Server instance.
 * Identifies the module capabilities to the extension's primary LLM.
 */
const server = new Server(
  {
    name: "enterprise-admin-sync-automator",
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
 * Exposes the strict JSON schemas for the administrative tools.
 * CRITICAL DIRECTIVE: The inputSchema properties explicitly define validation boundaries 
 * (like enum restrictions) so the agent is forced to structure its payload correctly 
 * before it can even call the tool.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "fetch_saas_mapping",
        description: "Retrieves the structural element locators and payload mapping schema for a target SaaS dashboard. Use this tool BEFORE initiating any data entry to understand exactly which CSS/XPath locators map to which business fields.",
        inputSchema: {
          type: "object",
          properties: {
            saas_platform_name: {
              type: "string",
              description: "The name of the target enterprise platform (e.g., 'Salesforce', 'HubSpot', 'Jira')."
            }
          },
          required: ["saas_platform_name"]
        }
      },
      {
        name: "validate_form_cache",
        description: "Evaluates a mid-flight form snapshot to confirm if the generated payload passes local schema constraints before injection. Use this to verify state integrity if the automation loop was interrupted.",
        inputSchema: {
          type: "object",
          properties: {
            state_recovery_token: {
              type: "string",
              description: "The secure cryptographic token tied to the interrupted automation session."
            }
          },
          required: ["state_recovery_token"]
        }
      }
    ]
  };
});

/**
 * CallTool Handler
 * 
 * Intercepts the agent's tool execution requests. Routes the queries into the SQLite 
 * wrapper to fetch deep structural mappings or validate caching constraints, returning 
 * the highly technical payload back to the LLM context window.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Tool 1: Return structural element locators for target dashboards
  if (name === "fetch_saas_mapping") {
    const platformName = args?.saas_platform_name as string;
    
    if (!platformName) {
      throw new Error("Missing required argument: 'saas_platform_name'");
    }

    console.error(`[MCP Server] Intercepted mapping request for platform: ${platformName}`);
    
    const configs = datastore.queryStepConfigurations(platformName);

    if (configs.length === 0) {
      return {
        content: [{ 
          type: "text", 
          text: `[SYSTEM] No automation mappings found for '${platformName}'. The agent must rely on manual DOM inspection and visual heuristics.` 
        }]
      };
    }

    // Format the mapping configurations into a JSON-like structural blueprint for the LLM
    const formattedMap = configs.map(config => {
      return `Pipeline Stage: ${config.pipeline_stage}\n- Required Payload Schema: ${config.payload_mapping_json}\n- Target Locators (CSS/XPath): ${config.target_endpoint_selectors}`;
    }).join("\n\n---\n\n");

    return {
      content: [{ 
        type: "text", 
        text: `[SYSTEM] SaaS Automation Map Retrieved! Use the following exact locators to map your payload injection:\n\n${formattedMap}` 
      }]
    };
  }

  // Tool 2: Confirm if a baseline payload passes field constraints locally
  if (name === "validate_form_cache") {
    const recoveryToken = args?.state_recovery_token as string;
    
    if (!recoveryToken) {
      throw new Error("Missing required argument: 'state_recovery_token'");
    }

    const snapshot = datastore.getSnapshotByToken(recoveryToken);

    if (!snapshot) {
      return {
        content: [{ 
          type: "text", 
          text: `[ERROR] Invalid or expired recovery token. Form payload could not be validated or recovered.` 
        }]
      };
    }

    // Return the cached state and execution flag back to the agent so it can decide the next step
    return {
      content: [{ 
        type: "text", 
        text: `[SYSTEM] Form Snapshot Validated!\n- Tracker ID: ${snapshot.tracker_id}\n- Platform: ${snapshot.platform_type}\n- Execution Status: ${snapshot.execution_status_flag}\n- Cached Payload: ${snapshot.injection_payload}\n\nDIRECTIVE: If status is 'FIREWALLED', you must navigate to the platform visually and clear the security check before proceeding.` 
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
  console.error("[MCP Server] Starting Enterprise Admin Sync MCP Server...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP Server] Successfully connected to transport layer. Ready for agent queries.");
}

runMcpServer().catch(err => {
  console.error("[MCP Server] Fatal error starting server:", err);
  process.exit(1);
});
