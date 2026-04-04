// Facebook GraphQL doc_id interceptor
// Passively captures doc_id + query name pairs from the page's own GraphQL requests
// via chrome.webRequest.onBeforeRequest — no JS bundle parsing needed
import { log } from '../../shared/logger.js';

const MODULE = 'DocID';
const STORAGE_KEY = 'fb_doc_ids';
const TTL = 5 * 60 * 60 * 1000; // 5 hours (matches Pancake)

// In-memory cache: queryName → doc_id
let docIdMap = new Map();
let initialized = false;
let saveTimer = null;

/**
 * Start the doc_id interceptor
 * Listens for GraphQL requests and extracts doc_id + query name
 */
export function startInterceptor() {
  if (initialized) return;
  initialized = true;

  // Load persisted doc_ids from storage
  loadFromStorage();

  // Listen for Facebook GraphQL POST requests
  try {
    chrome.webRequest.onBeforeRequest.addListener(
      onGraphQLRequest,
      {
        urls: [
          '*://business.facebook.com/api/graphql/*',
          '*://www.facebook.com/api/graphql/*',
          '*://web.facebook.com/api/graphql/*',
        ],
        types: ['xmlhttprequest'],
      },
      ['requestBody']
    );
    log.info(MODULE, 'Interceptor started');
  } catch (err) {
    log.error(MODULE, 'Failed to start interceptor:', err.message);
  }
}

/**
 * Handle intercepted GraphQL request
 */
function onGraphQLRequest(details) {
  try {
    const formData = details.requestBody?.formData;
    if (!formData) return;

    // Single request: doc_id + fb_api_req_friendly_name
    const docId = formData.doc_id?.[0];
    const name = formData.fb_api_req_friendly_name?.[0];

    if (docId && name) {
      const existing = docIdMap.get(name);
      if (existing !== docId) {
        docIdMap.set(name, docId);
        log.debug(MODULE, `${name} → ${docId}`);
        debouncedSave();
      }
    }

    // Batch request: multiple queries in variables[0..N]
    // Some Facebook pages batch multiple GraphQL queries
    for (const key of Object.keys(formData)) {
      if (key.startsWith('queries')) {
        try {
          const val = formData[key]?.[0];
          if (val) {
            const parsed = JSON.parse(val);
            if (parsed?.doc_id && parsed?.query_name) {
              const existing = docIdMap.get(parsed.query_name);
              if (existing !== parsed.doc_id) {
                docIdMap.set(parsed.query_name, parsed.doc_id);
                log.debug(MODULE, `batch: ${parsed.query_name} → ${parsed.doc_id}`);
                debouncedSave();
              }
            }
          }
        } catch { /* not JSON, skip */ }
      }
    }
  } catch (err) {
    // Silent — don't break the request
  }
}

/**
 * Get all intercepted doc_ids as a plain object
 * Returns null if no doc_ids available
 */
export function getInterceptedDocIds() {
  if (docIdMap.size === 0) return null;
  return Object.fromEntries(docIdMap);
}

/**
 * Get count of intercepted doc_ids
 */
export function getInterceptedCount() {
  return docIdMap.size;
}

// === Persistence ===

function debouncedSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveToStorage();
  }, 3000);
}

async function saveToStorage() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        ids: Object.fromEntries(docIdMap),
        timestamp: Date.now(),
      },
    });
    log.debug(MODULE, `Saved ${docIdMap.size} doc_ids to storage`);
  } catch (err) {
    log.debug(MODULE, 'Save failed:', err.message);
  }
}

async function loadFromStorage() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const data = result[STORAGE_KEY];
    if (data?.ids && data.timestamp && (Date.now() - data.timestamp < TTL)) {
      docIdMap = new Map(Object.entries(data.ids));
      const ageMin = Math.round((Date.now() - data.timestamp) / 60000);
      log.info(MODULE, `Loaded ${docIdMap.size} doc_ids from storage (age: ${ageMin}min)`);
    } else if (data) {
      log.info(MODULE, 'Stored doc_ids expired, clearing');
      chrome.storage.local.remove(STORAGE_KEY);
    }
  } catch (err) {
    log.debug(MODULE, 'Load failed:', err.message);
  }
}
