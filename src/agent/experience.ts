export interface Experience {
  goal: string;
  steps: string[];
  timestamp: number;
}

export class ExperienceStore {
  static async getExperiences(): Promise<Experience[]> {
    const res = await chrome.storage.local.get("experience_db");
    if (res.experience_db && Array.isArray(res.experience_db)) {
      return res.experience_db;
    }
    return [];
  }

  static async saveExperience(goal: string, history: Array<{ action: string; detail: string }>) {
    // Only save meaningful actions
    const steps = history
      .filter(h => !['thinking', 'observing', 'verify_fail', 'wait'].includes(h.action))
      .map(h => `${h.action}: ${h.detail}`);
      
    if (steps.length === 0) return;

    const experiences = await this.getExperiences();
    
    // Check if we already have this exact goal
    const idx = experiences.findIndex(e => e.goal === goal);
    if (idx >= 0) {
      experiences[idx].steps = steps;
      experiences[idx].timestamp = Date.now();
    } else {
      experiences.push({ goal, steps, timestamp: Date.now() });
    }

    // Keep the last 50 experiences to avoid bloating storage
    if (experiences.length > 50) {
      experiences.sort((a, b) => b.timestamp - a.timestamp);
      experiences.length = 50;
    }

    await chrome.storage.local.set({ experience_db: experiences });
  }

  static async findSimilarExperience(currentGoal: string): Promise<Experience | null> {
    const experiences = await this.getExperiences();
    if (experiences.length === 0) return null;

    const tokenize = (text: string) => (text || "").toLowerCase().split(/\W+/).filter(w => w.length > 2);
    const targetTokens = new Set(tokenize(currentGoal));
    
    if (targetTokens.size === 0) return null;

    let bestMatch: Experience | null = null;
    let bestScore = 0;

    for (const exp of experiences) {
      const expTokens = new Set(tokenize(exp.goal));
      let overlap = 0;
      for (const token of targetTokens) {
        if (expTokens.has(token)) overlap++;
      }
      
      const score = overlap / Math.max(targetTokens.size, expTokens.size);
      if (score > 0.4 && score > bestScore) { // 40% similarity threshold
        bestScore = score;
        bestMatch = exp;
      }
    }

    return bestMatch;
  }
}
