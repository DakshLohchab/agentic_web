import { AgentLoop } from "./loop";

class SwarmCoordinator {
  private agents = new Map<number, AgentLoop>(); // tabId -> AgentLoop instance
  globalMemory: Record<string, any> = {};

  async spawnGhostWorker(url: string, goal: string) {
    const tab = await chrome.tabs.create({ url, active: false });
    if (tab.id) {
      return this.spawnAgent(tab.id, goal);
    }
    return null;
  }

  async spawnAgent(tabId: number, goal: string) {
    if (this.agents.has(tabId)) {
      await this.stopAgent(tabId);
    }
    
    const agent = new AgentLoop(this.globalMemory);
    this.agents.set(tabId, agent);
    
    agent.start(tabId, goal).catch(err => {
      console.error(`[Swarm] Agent error on tab ${tabId}:`, err);
    });
    
    return agent.getState();
  }

  async stopAgent(tabId: number) {
    const agent = this.agents.get(tabId);
    if (agent) {
      await agent.stop();
      this.agents.delete(tabId);
    }
  }

  async stopAll() {
    for (const tabId of this.agents.keys()) {
      await this.stopAgent(tabId);
    }
  }

  getSwarmState() {
    const states: Record<number, any> = {};
    for (const [tabId, agent] of this.agents.entries()) {
      states[tabId] = agent.getState();
    }
    return states;
  }

  getAgent(tabId: number) {
    return this.agents.get(tabId);
  }
}

export const Swarm = new SwarmCoordinator();
