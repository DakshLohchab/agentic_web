export interface AgentState {
  tabId: number | null;
  running: boolean;
  goal: string;
  history: Array<{ action: string; detail: string; thought: string; outcome: string }>;
  step: number;
  retryCount: number;
  status: string;
  lastThought: string;
  lastAction: string;
  lastError: string;
  globalPlan: string[];
  currentStepIndex: number;
  actionHistory: string[];
  snapshot: any;
  nextAction: any;
}

export type NodeFunction = (state: AgentState) => Promise<Partial<AgentState>>;
export type EdgeFunction = (state: AgentState) => string;

export class StateGraph {
  private nodes = new Map<string, NodeFunction>();
  private edges = new Map<string, EdgeFunction>();
  private startNode = "";

  addNode(name: string, fn: NodeFunction): this {
    this.nodes.set(name, fn);
    return this;
  }

  addEdge(fromNode: string, routingFn: EdgeFunction): this {
    this.edges.set(fromNode, routingFn);
    return this;
  }

  setEntryPoint(name: string): this {
    this.startNode = name;
    return this;
  }

  async execute(
    initialState: AgentState,
    onUpdate: (state: AgentState) => Promise<void>
  ): Promise<AgentState> {
    let currentState = { ...initialState };
    let currentNodeName = this.startNode;

    while (currentNodeName && currentState.running) {
      const nodeFn = this.nodes.get(currentNodeName);
      if (!nodeFn) {
        throw new Error(`Node function not found for: ${currentNodeName}`);
      }

      try {
        const updates = await nodeFn(currentState);
        currentState = { ...currentState, ...updates };
        await onUpdate(currentState);
      } catch (err: any) {
        // Handled by state validator or retry limits
        currentState.lastError = err.message || String(err);
        currentState.retryCount += 1;
        await onUpdate(currentState);
      }

      const edgeFn = this.edges.get(currentNodeName);
      if (edgeFn) {
        currentNodeName = edgeFn(currentState);
      } else {
        break; // Reach terminal state node
      }
    }

    return currentState;
  }
}
