// Facebook Session Manager
// Handles fb_dtsg extraction, page initialization, and session caching
import { CONFIG } from '../../shared/config.js';
import { log } from '../../shared/logger.js';
import { getInterceptedDocIds } from './doc-id-interceptor.js';

const MODULE = 'FB-Session';

// Cache: pageId → { token, lsd, jazoest, userId, rev, hs, hsi, spinR, spinB, spinT, timestamp }
const sessionCache = new Map();

// Pending init promises to deduplicate concurrent initPage() calls
const pendingInits = new Map();

// GraphQL doc_ids cache
let docIds = null;

// Track if preload is in progress
let preloadPromise = null;

/**
 * Wait for doc_id preloading to finish (JS bundle extraction)
 * Call this before attempting strategies that need doc_ids
 */
export async function waitForDocIds(timeoutMs = 15000) {
  if (!preloadPromise) return;
  try {
    await Promise.race([
      preloadPromise,
      new Promise(resolve => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {}
}

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

  // Extract doc_ids from Business Suite HTML inline scripts
  const htmlDocIds = extractDocIds(html);
  if (htmlDocIds) {
    docIds = { ...(docIds || {}), ...htmlDocIds };
    log.info(MODULE, `Extracted ${Object.keys(htmlDocIds).length} doc_ids from Business Suite HTML`);
  }

  // Fetch JS bundles from Business Suite page (Messenger/Inbox queries live here)
  // Non-blocking: runs in background
  if (!preloadPromise) {
    preloadPromise = _fetchJsBundlesForDocIds(html, 'BizSuite').then(() => {
      // Also fetch from www.facebook.com for additional doc_ids
      return _fetchJsBundlesForDocIds(null, 'www.facebook.com');
    }).catch(err => {
      log.error(MODULE, 'preloadDocIds failed:', err.message);
    });
  }

  // Log important doc_ids
  _logImportantDocIds();

  log.info(MODULE, `Session initialized for page ${pageId}:`);
  log.info(MODULE, `  fb_dtsg: ${sessionData.token?.substring(0, 20)}...`);
  log.info(MODULE, `  lsd: ${sessionData.lsd || 'NULL'}, jazoest: ${sessionData.jazoest || 'NULL'}`);
  log.info(MODULE, `  userId: ${sessionData.userId || 'NULL'}, rev: ${sessionData.rev || 'NULL'}`);
  log.info(MODULE, `  hs: ${sessionData.hs || 'NULL'}, hsi: ${sessionData.hsi || 'NULL'}`);
  log.info(MODULE, `  spinR: ${sessionData.spinR || 'NULL'}, spinB: ${sessionData.spinB || 'NULL'}, spinT: ${sessionData.spinT || 'NULL'}`);
  log.info(MODULE, `  pkgCohort: ${sessionData.pkgCohort || 'NULL'}, pr: ${sessionData.pr || 'NULL'}, msgrRegion: ${sessionData.msgrRegion || 'NULL'}`);
  log.info(MODULE, `  cquickToken: ${sessionData.cquickToken ? sessionData.cquickToken.substring(0, 20) + '...' : 'NULL'}`);
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
 * Get GraphQL doc_ids — merges HTML-extracted + webRequest-intercepted
 * Intercepted doc_ids take priority (they're real, current values from the page)
 */
export function getDocIds() {
  const htmlIds = docIds || {};
  const interceptedIds = getInterceptedDocIds() || {};
  const merged = { ...htmlIds, ...interceptedIds };
  return Object.keys(merged).length > 0 ? merged : null;
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
    pkgCohort: null,
    pr: null,
    msgrRegion: null,
    cquickToken: null,
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

  // Extract pkg_cohort (__pc)
  const pcMatch = html.match(/"pkg_cohort":"([^"]+)"/);
  if (pcMatch) data.pkgCohort = pcMatch[1];

  // Extract device pixel ratio (dpr)
  const prMatch = html.match(/"pr":(\d+(?:\.\d+)?)/);
  if (prMatch) data.pr = prMatch[1];

  // Extract msgrRegion (X-MSGR-Region header)
  const msgrMatch = html.match(/"msgrRegion":"([^"]+)"/);
  if (msgrMatch) data.msgrRegion = msgrMatch[1];

  // Extract compat_iframe_token (cquick_token) for PagesManagerInboxQueryUtilCommItemHeaderMercuryQuery
  const cquickMatch = html.match(/"compat_iframe_token":"([^"]+)"/);
  if (cquickMatch) data.cquickToken = cquickMatch[1];

  return data;
}

/**
 * Extract GraphQL doc_ids from HTML or JS content
 * Based on actual Facebook formats found via debugging:
 *
 * HTML format:
 *   "queryID":"12345","variables":[],"queryName":"SomeQuery"
 *
 * JS bundle format (_facebookRelayOperation):
 *   __d("SomeQuery_facebookRelayOperation",[],(function(t,n,r,o,a,i){a.exports="12345"}),null);
 *
 * JS bundle format (PreloadableConcreteRequest):
 *   params:{id:n("SomeQuery_facebookRelayOperation"),... name:"SomeQuery"}
 */
function extractDocIds(content) {
  const ids = {};
  let match;

  // === Pattern A: HTML preloader format (CONFIRMED working) ===
  // "queryID":"24509960031928090","variables":[],"queryName":"CometSettingsBadgeQuery"
  const regexA1 = /"queryID":"(\d{5,})"[^}]*?"queryName":"([^"]+)"/g;
  while ((match = regexA1.exec(content)) !== null) {
    ids[match[2]] = match[1];
  }
  // Reverse order: queryName first
  const regexA2 = /"queryName":"([^"]+)"[^}]*?"queryID":"(\d{5,})"/g;
  while ((match = regexA2.exec(content)) !== null) {
    if (!ids[match[1]]) ids[match[1]] = match[2];
  }

  // === Pattern B: _facebookRelayOperation (CONFIRMED working) ===
  // __d("SecuredActionBlockDialogQuery_facebookRelayOperation",[],(function(t,n,r,o,a,i){a.exports="25888131174151444"}),null);
  // Key fix: [^}]* instead of [^)]* — the function body has () but not } before exports
  const regexB = /"([^"]+)_facebookRelayOperation"[^}]*\.exports="(\d{5,})"/g;
  while ((match = regexB.exec(content)) !== null) {
    if (!ids[match[1]]) ids[match[1]] = match[2];
  }

  // === Pattern C: docID + queryName (legacy format) ===
  const regexC = /"docID":"(\d+)","queryName":"([^"]+)"/g;
  while ((match = regexC.exec(content)) !== null) {
    if (!ids[match[2]]) ids[match[2]] = match[1];
  }

  // === Pattern D: Unquoted keys (some JS bundles) ===
  // queryID:"12345",...,queryName:"SomeQuery"
  const regexD1 = /queryID:"(\d{5,})"[^}]*?queryName:"([^"]+)"/g;
  while ((match = regexD1.exec(content)) !== null) {
    if (!ids[match[2]]) ids[match[2]] = match[1];
  }
  const regexD2 = /queryName:"([^"]+)"[^}]*?queryID:"(\d{5,})"/g;
  while ((match = regexD2.exec(content)) !== null) {
    if (!ids[match[1]]) ids[match[1]] = match[2];
  }

  // === Pattern E: PreloadableConcreteRequest params ===
  // params:{id:n("SomeQuery_facebookRelayOperation"),...name:"SomeQuery"}
  const regexE = /params:\{id:[a-z]\("([^"]+)_facebookRelayOperation"\)[^}]*?name:"([^"]+)"/g;
  while ((match = regexE.exec(content)) !== null) {
    // The id is resolved at runtime from the _facebookRelayOperation module
    // We just record the query name here — the actual ID comes from Pattern B
    // But if we can find the ID directly:
    if (!ids[match[2]] && !ids[match[1]]) {
      // Mark as needing resolution — will be filled by Pattern B
    }
  }

  return Object.keys(ids).length > 0 ? ids : null;
}

/**
 * Log important doc_ids for debugging
 */
function _logImportantDocIds() {
  const allDocIds = getDocIds();
  if (!allDocIds) {
    log.info(MODULE, 'No doc_ids available yet');
    return;
  }
  // Log both legacy and new query names
  const important = [
    'PagesManagerInboxAdminAssignerRootQuery',
    'BusinessCometInboxThreadDetailHeaderQuery',
    'BizInboxThreadDetailHeaderQuery',
    'MessengerThreadlistWebGraphQLQuery',
    'MessengerThreadlistQuery',
    'MessengerGraphQLThreadlistFetcher',
    'useMWGetFetchUserThreadNavigationDataQuery',
    'BizInboxCustomerRelaySearchSourceQuery',
    'BizInboxSearchResultFacebookListQuery',
  ];
  log.info(MODULE, `Total doc_ids: ${Object.keys(allDocIds).length}`);
  for (const name of important) {
    if (allDocIds[name]) {
      log.info(MODULE, `  ✓ ${name}: ${allDocIds[name]}`);
    }
  }
  const foundCount = important.filter(n => allDocIds[n]).length;
  if (foundCount === 0) {
    log.info(MODULE, '  ⚠ None of the important doc_ids found');
  }
}

/**
 * Fetch JS bundles from an HTML page and extract doc_ids
 * @param {string|null} html - Pre-fetched HTML, or null to fetch www.facebook.com
 * @param {string} label - Label for logging
 */
async function _fetchJsBundlesForDocIds(html, label) {
  // If no HTML provided, fetch www.facebook.com
  if (!html) {
    try {
      const resp = await fetch('https://www.facebook.com/', {
        credentials: 'include',
        headers: { 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
      });
      if (!resp.ok) { log.error(MODULE, `${label}: HTTP ${resp.status}`); return; }
      html = await resp.text();
    } catch (err) { log.error(MODULE, `${label}: fetch failed:`, err.message); return; }
  }

  log.info(MODULE, `${label}: scanning ${html.length} bytes for JS bundle URLs...`);

  // Extract doc_ids from inline HTML
  const inlineIds = extractDocIds(html);
  if (inlineIds) {
    const count = Object.keys(inlineIds).length;
    docIds = { ...(docIds || {}), ...inlineIds };
    log.info(MODULE, `${label}: ${count} doc_ids from inline HTML`);
  }

  // Extract <script src="..."> URLs
  const scriptUrls = [];
  const srcRegex = /<script[^>]+src="(https:\/\/static[^"]+\.js[^"]*)"/g;
  let m;
  while ((m = srcRegex.exec(html)) !== null) {
    scriptUrls.push(m[1]);
  }
  log.info(MODULE, `${label}: ${scriptUrls.length} script URLs found`);

  if (scriptUrls.length === 0) return;

  // Fetch all JS bundles in batches of 10
  let foundCount = 0;
  for (let i = 0; i < scriptUrls.length; i += 10) {
    const batch = scriptUrls.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(url =>
        fetch(url, { credentials: 'omit' })
          .then(r => r.ok ? r.text() : '')
          .catch(() => '')
      )
    );

    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const jsIds = extractDocIds(result.value);
      if (jsIds) {
        foundCount += Object.keys(jsIds).length;
        docIds = { ...(docIds || {}), ...jsIds };
      }
    }
  }

  const total = docIds ? Object.keys(docIds).length : 0;
  log.info(MODULE, `${label}: ${foundCount} new doc_ids from ${scriptUrls.length} JS bundles, ${total} total`);
  _logImportantDocIds();
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
