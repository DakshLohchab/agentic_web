/**
 * File: logistics-worker.ts
 * Role: Headless Matrix & Tracking Worker
 * 
 * Description:
 * This standalone background daemon handles the headless synchronization of logistics 
 * data, polling both flight/freight aggregators (for dynamic pricing) and active 
 * tracking portals (for shipment checkpoints).
 * 
 * To ensure the LLM agent is fed near real-time intelligence without sequential blocking, 
 * this script chunks target tracking numbers and route signatures into concurrent batches. 
 * It heavily leverages `Promise.all` to simulate 'delegate' ghost workers querying 
 * multiple carrier nodes simultaneously.
 * 
 * OBSTRUCTION HANDLING BLOCK (Dark Patterns):
 * Travel booking sites and aggregators intentionally deploy aggressive "Dark Patterns" to 
 * induce FOMO (Fear of Missing Out). They inject fixed-position modals like "Hurry, 2 seats left!" 
 * or "5 people are looking at this flight." These elements block DOM scrapers and corrupt 
 * HTML table extraction. This worker explicitly executes an absolute overlay destruction 
 * process ('nukeDarkPatternOverlays') before any pricing matrix is parsed.
 */

import fetch from 'node-fetch';
import crypto from 'crypto';
import cron from 'node-cron';
import { LogisticsDatastore, ItineraryMatrix, ActiveShipment } from './logistics-datastore';

const datastore = new LogisticsDatastore('./logistics-engineering.db');

// Mock roster of target active shipments and generic travel routes to monitor
const TARGET_ROUTES = ["JFK-LHR-2026-10-14", "SFO-NRT-2026-11-05"];
const TARGET_SHIPMENTS = ["1Z9999999999999999", "9400100000000000000000"];

/**
 * Executes a strict simulated browser injection that explicitly targets and obliterates 
 * travel aggregator "Dark Patterns" (urgency popups, newsletter banners).
 * 
 * In a real automated Puppeteer session, this payload is executed against the 
 * active DOM *before* the flight/freight tables are serialized into JSON.
 * 
 * @returns string - A stringified JavaScript payload representing the destructive logic.
 */
function getDarkPatternDestructionScript(): string {
  return `
    (function nukeDarkPatternOverlays() {
      const allNodes = document.querySelectorAll('*');
      let obliteratedCount = 0;
      
      for (const node of allNodes) {
        const style = window.getComputedStyle(node);
        const pos = style.position;
        
        // Travel modals typically use fixed/absolute positioning to lock the viewport
        if (pos === 'fixed' || pos === 'absolute') {
          const zIndex = parseInt(style.zIndex);
          const innerText = node.textContent ? node.textContent.toLowerCase() : "";
          
          // Heuristic detection: high z-index + manipulative urgency text
          const isManipulative = innerText.includes("hurry") || 
                                 innerText.includes("left at this price") || 
                                 innerText.includes("looking at this");
                                 
          if ((!isNaN(zIndex) && zIndex > 50) || isManipulative) {
            node.remove();
            obliteratedCount++;
          }
        }
      }
      return obliteratedCount;
    })();
  `;
}

/**
 * Simulates a headless fetch operation for a specific flight/freight route aggregator.
 * It applies the obstruction-handling destruction script and extracts dynamic baseline pricing.
 * 
 * @param routeSignature - The target itinerary route (e.g., 'JFK-LHR-2026-10-14').
 * @returns Promise<ItineraryMatrix | null> - The newly extracted baseline pricing state.
 */
async function scrapeRoutePricingHeadlessly(routeSignature: string): Promise<ItineraryMatrix | null> {
  console.log(`[Logistics Worker] Initiating headless aggregator scrape for route: ${routeSignature}`);
  
  try {
    // 1. Simulate the headless injection of the UI destruction payload
    console.log(`[Logistics Worker] [${routeSignature}] Executing 'nukeDarkPatternOverlays' to destroy urgency popups...`);
    const nukeScript = getDarkPatternDestructionScript();
    
    // Simulate network parsing latency
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
    
    // 2. Generate simulated pricing data mimicking dynamic travel fluctuations
    const mockBaselinePrice = 450 + (Math.random() * 200);
    const mockHiddenFees = JSON.stringify({ baggage: 50, seat_selection: 35, taxes: Math.floor(mockBaselinePrice * 0.08) });

    const matrixRecord: ItineraryMatrix = {
      id: crypto.createHash('md5').update(`${routeSignature}_${Date.now()}`).digest('hex'),
      route_signature: routeSignature,
      transport_mode: "AIR",
      dynamic_price: parseFloat(mockBaselinePrice.toFixed(2)),
      hidden_fees: mockHiddenFees,
      last_checked: Date.now()
    };

    return matrixRecord;
  } catch (error: any) {
    console.error(`[Logistics Worker] Network error while parsing route aggregator:`, error.message);
    return null;
  }
}

/**
 * Simulates a parallel fetch operation checking an active tracking portal (e.g., FedEx, UPS).
 * 
 * @param trackingNumber - The specific parcel identifier.
 * @returns Promise<ActiveShipment | null> - The latest status checkpoint.
 */
async function checkShipmentStatusConcurrently(trackingNumber: string): Promise<ActiveShipment | null> {
  console.log(`[Logistics Worker] Pinging tracking carrier for parcel: ${trackingNumber}`);
  
  try {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1500 + 500));
    
    // Simulate logistics state changes. 20% chance of a customs/weather delay exception.
    const isDelayed = Math.random() < 0.20;
    const mockStatus = isDelayed ? "CUSTOMS_DELAY_EXCEPTION" : "IN_TRANSIT_ON_TIME";
    const carrierName = trackingNumber.startsWith("1Z") ? "UPS" : "USPS";

    const shipmentRecord: ActiveShipment = {
      id: trackingNumber, // ID is the tracking number itself
      tracking_number: trackingNumber,
      carrier: carrierName,
      status_checkpoint: mockStatus,
      location_coords: "{\"lat\": 40.7128, \"lng\": -74.0060, \"hub\": \"New York Sorting Facility\"}",
      updated_at: Date.now()
    };

    return shipmentRecord;
  } catch (error: any) {
    console.error(`[Logistics Worker] Error pinging carrier API for ${trackingNumber}:`, error.message);
    return null;
  }
}

/**
 * The core asynchronous orchestration loop.
 * Iterates through target routes and active shipments, maintaining real-time logistics fidelity.
 */
async function startLogisticsPollingLoop() {
  console.log("[Logistics Worker] Waking up. Spawning parallel ghost-workers for route pricing and shipment tracking...");

  // Phase 1: Parallel Route Aggregator Scraping
  const routePromises = TARGET_ROUTES.map(route => scrapeRoutePricingHeadlessly(route));
  const routeResults = await Promise.all(routePromises);
  
  for (const matrix of routeResults) {
    if (matrix) {
      datastore.upsertRoutePricing(matrix);
      console.log(`[Logistics Worker] ✅ Cached baseline price for ${matrix.route_signature}: $${matrix.dynamic_price}`);
    }
  }

  // Phase 2: Parallel Active Shipment Pinging
  const trackingPromises = TARGET_SHIPMENTS.map(tracking => checkShipmentStatusConcurrently(tracking));
  const trackingResults = await Promise.all(trackingPromises);

  for (const shipment of trackingResults) {
    if (shipment) {
      datastore.upsertShipmentStatus(shipment);
      const delayWarning = shipment.status_checkpoint.includes("DELAY") ? "⚠️ DELAY DETECTED" : "On Schedule";
      console.log(`[Logistics Worker] ✅ Updated shipment ${shipment.tracking_number}: ${delayWarning}`);
    }
  }

  console.log("[Logistics Worker] Polling loop complete. Yielding thread.");
}

/**
 * Bootstraps the background polling task.
 * Runs every 30 minutes to maintain steady logistics awareness without triggering IP rate limits.
 */
export function initializeLogisticsWorker() {
  console.log("[Logistics Worker] Initializing Travel & Logistics Engineering Automator...");
  cron.schedule('*/30 * * * *', () => {
    startLogisticsPollingLoop();
  });
  
  // Fire immediately for initial syncing
  startLogisticsPollingLoop();
}

// If invoked directly from CLI
if (true /* ESM execution */) {
  initializeLogisticsWorker();
}
