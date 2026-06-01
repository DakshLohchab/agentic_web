class SpeedRenderer {
  private baseRuleId = 100000;

  async enable(tabId: number) {
    try {
      const rules = [
        {
          id: this.baseRuleId + tabId,
          priority: 1,
          action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
          condition: {
            tabIds: [tabId],
            resourceTypes: [
              // STYLESHEET is excluded because CSS-in-JS frameworks (Next.js, Vite, CRA) 
              // load critical styles as stylesheets. Blocking them causes blank white pages.
              // IMAGE is excluded because the speed gain is marginal vs the breakage risk.
              chrome.declarativeNetRequest.ResourceType.MEDIA
            ]
          }
        }
      ];

      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: rules as any,
        removeRuleIds: [this.baseRuleId + tabId]
      });
    } catch (e) {
      console.warn("SpeedRenderer enable failed (missing declarativeNetRequest permissions?):", e);
    }
  }

  async disable(tabId: number) {
    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [this.baseRuleId + tabId]
      });
    } catch (e) {
      console.warn("SpeedRenderer disable failed:", e);
    }
  }
}

export const speedRenderer = new SpeedRenderer();
