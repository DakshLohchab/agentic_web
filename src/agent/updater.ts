import { KnowledgeDatastore } from "./datastore";
import { mcpBridge } from "../utils/native-bridge";
import { callLLM } from "../llm/index";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export async function runBiWeeklyUpdater() {
  try {
    const items = await KnowledgeDatastore.getItems();
    const now = Date.now();
    const needsUpdate = items.filter(i => (now - i.last_updated_timestamp) > FOURTEEN_DAYS_MS);

    if (needsUpdate.length > 0) {
      console.log(`[Updater] ${needsUpdate.length} items are older than 14 days. Triggering MCP scraping updates in background...`);
      for (const item of needsUpdate) {
        updateViaMCPScraper(item).catch(e => console.error("Scraper update failed for", item.vendor_url, e));
      }
    } else if (items.length === 0) {
      console.log("[Updater] Empty DB. Adding seed URLs for ESP32 and cameras to trigger initial scrape...");
      const seedUrls = [
        { name: "ESP32 Dev Module (Amazon)", url: "https://www.amazon.in/s?k=esp32+development+board" },
        { name: "ESP32 Camera Module (Robu)", url: "https://robu.in/product/esp32-cam-wifi-bluetooth-development-board-with-ov2640-camera-module/" },
        { name: "ESP32 Dev Module (Robocraze)", url: "https://robocraze.com/products/esp32-wifi-bluetooth-development-board" }
      ];
      for (const seed of seedUrls) {
        updateViaMCPScraper({
          item_name: seed.name,
          vendor_url: seed.url,
          price: "Unknown",
          stock_status: "Unknown",
          last_updated_timestamp: 0
        }).catch(() => {});
      }
    } else {
      console.log("[Updater] Database is up to date. No scraping required.");
    }
  } catch (e) {
    console.error("Bi-Weekly Updater Error:", e);
  }
}

async function updateViaMCPScraper(item: any) {
  // Use MCP integration to hit free-tier scraping endpoints (e.g., Jina reader)
  const jinaUrl = `https://r.jina.ai/${item.vendor_url}`;
  
  // Call the MCP scrape tool wrapper (assuming native host handles the actual execution)
  const mcpResult = await mcpBridge.executeTool("jina_scrape", { url: jinaUrl });
  const rawText = typeof mcpResult === "string" ? mcpResult : JSON.stringify(mcpResult);

  const prompt = `Extract item_name, price, and stock_status for this e-commerce product page text.
Return ONLY valid JSON: {"item_name": "...", "price": "...", "stock_status": "..."}
Text:
${rawText.substring(0, 6000)}`;

  const extracted = await callLLM("You are a data extractor.", prompt, null);
  
  if (extracted && extracted.price) {
    await KnowledgeDatastore.updateItem({
      item_name: extracted.item_name || item.item_name,
      vendor_url: item.vendor_url,
      price: extracted.price,
      stock_status: extracted.stock_status || "In Stock",
      last_updated_timestamp: Date.now()
    });
    console.log(`[Updater] Successfully updated ${item.vendor_url}`);
  } else {
    console.warn(`[Updater] Failed to extract data for ${item.vendor_url}`);
  }
}
