// Facebook Session Manager
// Handles fb_dtsg extraction, page initialization, and session caching
import { CONFIG } from '../../shared/config.js';
import { log } from '../../shared/logger.js';

const MODULE = 'FB-Session';

// Cache: pageId → { token, lsd, jazoest, userId, rev, hs, hsi, spinR, spinB, spinT, timestamp }
const sessionCache = new Map();

// Pending init promises to deduplicate concurrent initPage() calls
const pendingInits = new Map();

// GraphQL doc_ids cache
let docIds = null;

/**
 * Initialize a Facebook page session - extract fb_dtsg and session data
 * Uses promise deduplication to prevent concurrent fetches for the same pageId
 */
export async function initPage(pageId) {
  // Check cache first
  const cached = sessionCache.get(pageId);
  if (cached && Date.now() - cached.timestamp < CONFIG.FB_DTSG_TTL) {
    log.debug(MODULE, `Using cached session for page ${pageId}`);
    return cached;
  }

  // Deduplicate: if another initPage(pageId) is already in progress, wait for it
  if (pendingInits.has(pageId)) {
    log.info(MODULE, `Waiting for in-progress init for page ${pageId}...`);
    return pendingInits.get(pageId);
  }

  const initPromise = _doInitPage(pageId);
  pendingInits.set(pageId, initPromise);

  try {
    const result = await initPromise;
    return result;
  } finally {
    pendingInits.delete(pageId);
  }
}

/**
 * Internal: actual session initialization logic
 */
async function _doInitPage(pageId) {
  log.info(MODULE, `Initializing session for page ${pageId}...`);

  const url = `${CONFIG.FB_BUSINESS_INBOX}?page_id=${pageId}`;
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load Business Suite: ${response.status}`);
  }

  const html = await response.text();
  const sessionData = extractSessionData(html, pageId);

  if (!sessionData.token) {
    throw new Error('Failed to extract fb_dtsg from Business Suite page');
  }

  sessionData.timestamp = Date.now();
  sessionCache.set(pageId, sessionData);

  // Extract doc_ids if not cached
  if (!docIds) {
    docIds = extractDocIds(html);
    if (docIds) {
      log.info(MODULE, `Extracted ${Object.keys(docIds).length} GraphQL doc_ids`);
    }
  }

  log.info(MODULE, `Session initialized for page ${pageId}:`);
  log.info(MODULE, `  fb_dtsg: ${sessionData.token?.substring(0, 20)}...`);
  log.info(MODULE, `  lsd: ${sessionData.lsd || 'NULL'}, jazoest: ${sessionData.jazoest || 'NULL'}`);
  log.info(MODULE, `  userId: ${sessionData.userId || 'NULL'}, rev: ${sessionData.rev || 'NULL'}`);
  log.info(MODULE, `  hs: ${sessionData.hs || 'NULL'}, hsi: ${sessionData.hsi || 'NULL'}`);
  log.info(MODULE, `  spinR: ${sessionData.spinR || 'NULL'}, spinB: ${sessionData.spinB || 'NULL'}, spinT: ${sessionData.spinT || 'NULL'}`);
  return sessionData;
}

/**
 * Get cached session data for a page
 */
export function getSession(pageId) {
  return sessionCache.get(pageId) || null;
}

/**
 * Get all active sessions
 */
export function getAllSessions() {
  return Object.fromEntries(sessionCache);
}

/**
 * Get cached GraphQL doc_ids
 */
export function getDocIds() {
  return docIds;
}

/**
 * Clear session cache for a page
 */
export function clearSession(pageId) {
  sessionCache.delete(pageId);
}

/**
 * Extract fb_dtsg and session data from Facebook Business Suite HTML
 */
function extractSessionData(html, pageId) {
  const data = {
    token: null,
    lsd: null,
    jazoest: null,
    userId: null,
    rev: null,
    hs: null,
    hsi: null,
    spinR: null,
    spinB: null,
    spinT: null,
    pageId,
  };

  // Method 1: DTSGInitialData (most reliable)
  const dtsgMatch = html.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/);
  if (dtsgMatch) {
    data.token = dtsgMatch[1];
  }

  // Method 2: fb_dtsg hidden input (fallback)
  if (!data.token) {
    const inputMatch = html.match(/name="fb_dtsg"\s+value="([^"]+)"/);
    if (inputMatch) data.token = inputMatch[1];
  }

  // Method 3: DTSGInitData in script (another pattern)
  if (!data.token) {
    const altMatch = html.match(/"token":"([^"]+)","async_get_token"/);
    if (altMatch) data.token = altMatch[1];
  }

  // Extract LSD
  const lsdMatch = html.match(/"LSD",\[\],\{"token":"([^"]+)"/);
  if (lsdMatch) data.lsd = lsdMatch[1];

  // Extract jazoest
  const jazoestMatch = html.match(/jazoest=(\d+)/);
  if (jazoestMatch) data.jazoest = jazoestMatch[1];

  // Extract user ID (__user)
  const userMatch = html.match(/"USER_ID":"(\d+)"/);
  if (userMatch) data.userId = userMatch[1];

  // Extract __rev (client revision)
  const revMatch = html.match(/"client_revision":(\d+)/);
  if (revMatch) data.rev = revMatch[1];

  // Extract __hs (haste session)
  const hsMatch = html.match(/"haste_session":"([^"]+)"/);
  if (hsMatch) data.hs = hsMatch[1];

  // Extract __hsi
  const hsiMatch = html.match(/"hsi":"([^"]+)"/);
  if (hsiMatch) data.hsi = hsiMatch[1];

  // Extract __spin_r, __spin_b, __spin_t
  const spinRMatch = html.match(/"__spin_r":(\d+)/);
  if (spinRMatch) data.spinR = spinRMatch[1];

  const spinBMatch = html.match(/"__spin_b":"([^"]+)"/);
  if (spinBMatch) data.spinB = spinBMatch[1];

  const spinTMatch = html.match(/"__spin_t":(\d+)/);
  if (spinTMatch) data.spinT = spinTMatch[1];

  return data;
}

/**
 * Extract GraphQL doc_ids from Business Suite HTML
 * These are required for queries like PagesManagerInboxAdminAssignerRootQuery
 */
function extractDocIds(html) {
  const ids = {};

  // Pattern: "docID":"123456","queryName":"SomeQuery"
  const regex = /"docID":"(\d+)","queryName":"([^"]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    ids[match[2]] = match[1];
  }

  // Alternative pattern: __d("SomeQuery",{...,"__dr":"123456"...})
  const altRegex = /__d\("([^"]+)"[^}]*"__dr":"(\d+)"/g;
  while ((match = altRegex.exec(html)) !== null) {
    if (!ids[match[1]]) {
      ids[match[1]] = match[2];
    }
  }

  return Object.keys(ids).length > 0 ? ids : null;
}

/**
 * Handle PREINITIALIZE_PAGES message
 * Initialize sessions for multiple pages
 */
export async function handlePreinitializePages(data) {
  const { pageIds } = data;
  if (!pageIds || !Array.isArray(pageIds)) return;

  const results = {};
  for (const pageId of pageIds) {
    try {
      await initPage(pageId);
      results[pageId] = { success: true };
    } catch (err) {
      log.error(MODULE, `Failed to init page ${pageId}:`, err.message);
      results[pageId] = { success: false, error: err.message };
    }
  }

  return results;
}

/**
 * Handle GET_BUSINESS_CONTEXT message
 */
export async function handleGetBusinessContext(data) {
  const { pageId } = data;
  if (!pageId) throw new Error('pageId is required');

  const session = await initPage(pageId);
  return {
    type: 'GET_BUSINESS_CONTEXT_SUCCESS',
    dtsg: session.token,
    context: {
      userId: session.userId,
      rev: session.rev,
      hs: session.hs,
      hsi: session.hsi,
    },
    taskId: data.taskId,
  };
}
