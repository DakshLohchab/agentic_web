class MCPBridge {
  private port: chrome.runtime.Port | null = null;
  private pendingRequests = new Map<string, { resolve: (val: any) => void, reject: (err: any) => void, timer: any }>();
  private requestCounter = 0;

  constructor() {
    this.connect();
  }

  private connect() {
    try {
      this.port = chrome.runtime.connectNative('com.agentic.browser.mcp');
      
      this.port.onMessage.addListener((msg) => {
        this.handleMessage(msg);
      });
      
      this.port.onDisconnect.addListener(() => {
        console.warn("MCP Native Host disconnected. Error:", chrome.runtime.lastError?.message);
        this.port = null;
        this.rejectAllPending(new Error("Native host disconnected: " + (chrome.runtime.lastError?.message || "Unknown error")));
        
        // Attempt to silently reconnect after a delay
        setTimeout(() => this.connect(), 5000);
      });
    } catch (e) {
      console.error("Failed to establish native host connection:", e);
    }
  }

  private handleMessage(msg: any) {
    // Check if the response contains the requestId directly, or nested inside receivedPayload (as implemented in our mock Node host)
    const requestId = msg.requestId || msg.receivedPayload?.requestId;
    
    if (requestId && this.pendingRequests.has(requestId)) {
      const { resolve, timer } = this.pendingRequests.get(requestId)!;
      clearTimeout(timer);
      this.pendingRequests.delete(requestId);
      resolve(msg);
    } else {
      console.debug("Received unhandled or broadcast native message:", msg);
    }
  }

  private rejectAllPending(error: Error) {
    for (const [id, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer);
      req.reject(error);
    }
    this.pendingRequests.clear();
  }

  /**
   * Executes a tool via the Model Context Protocol native host.
   */
  async executeTool(toolName: string, args: any): Promise<any> {
    if (!this.port) {
      throw new Error("Native MCP host port is not currently connected.");
    }

    this.requestCounter++;
    const requestId = `req_${Date.now()}_${this.requestCounter}`;

    return new Promise((resolve, reject) => {
      // Implement a 30 second timeout for MCP tool executions
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Native request timeout for tool execution: ${toolName}`));
      }, 30000);

      this.pendingRequests.set(requestId, { resolve, reject, timer });

      try {
        if (!this.port) {
          throw new Error("Native messaging port not connected");
        }
        this.port.postMessage({
          intent: 'mcp_execute',
          requestId,
          toolName,
          args
        });
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        reject(err);
      }
    });
  }
}

// Export as a singleton so it shares the single native port connection across the extension
export const mcpBridge = new MCPBridge();
