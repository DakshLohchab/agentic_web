export interface CachedItem {
  item_name: string;
  vendor_url: string;
  price: string;
  stock_status: string;
  last_updated_timestamp: number;
}

export class KnowledgeDatastore {
  static async getItems(): Promise<CachedItem[]> {
    const res = await chrome.storage.local.get("knowledge_db");
    return res.knowledge_db || [];
  }

  static async saveItems(items: CachedItem[]) {
    await chrome.storage.local.set({ knowledge_db: items });
  }

  static async query(searchTerm: string): Promise<CachedItem[]> {
    const items = await this.getItems();
    const term = searchTerm.toLowerCase();
    // Return all items if search term is empty, otherwise filter
    if (!term) return items;
    return items.filter(i => 
      i.item_name.toLowerCase().includes(term) || 
      i.vendor_url.toLowerCase().includes(term) ||
      term.includes("esp32") && i.item_name.toLowerCase().includes("esp32") ||
      term.includes("camera") && i.item_name.toLowerCase().includes("cam")
    );
  }

  static async updateItem(item: CachedItem) {
    const items = await this.getItems();
    const idx = items.findIndex(i => i.vendor_url === item.vendor_url);
    if (idx >= 0) {
      items[idx] = item;
    } else {
      items.push(item);
    }
    await this.saveItems(items);
  }
}
