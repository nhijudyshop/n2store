// Facebook Global ID Resolver
// Handles GET_GLOBAL_ID_FOR_CONV - resolves thread_id to globalUserId via GraphQL
import { CONFIG } from '../../shared/config.js';
import { log } from '../../shared/logger.js';
import { initPage, getSession, getDocIds } from './session.js';
import { parseFbRes, buildBaseParams, encodeFormData, buildFbHeaders } from './utils.js';

const MODULE = 'FB-GlobalID';

// Persistent cache: threadId → globalId
const globalIdCache = new Map();

/**
 * Handle GET_GLOBAL_ID_FOR_CONV message
 * Resolves a conversation thread_id to a Facebook global user ID
 */
export async function handleGetGlobalIdForConv(data, sendResponse) {
  const { pageId, threadId, threadKey, isBusiness = true, taskId } = data;

  log.info(MODULE, `Resolving global ID: page=${pageId}, thread=${threadId}`);

  if (!pageId || !threadId) {
    return sendResponse({
      type: 'GET_GLOBAL_ID_FOR_CONV_FAILURE',
      taskId,
      error: 'pageId and threadId required',
    });
  }

  // Check cache
  const cached = globalIdCache.get(`${pageId}:${threadId}`);
  if (cached) {
    log.info(MODULE, `Cache hit: ${threadId} → ${cached}`);
    return sendResponse({
      type: 'GET_GLOBAL_ID_FOR_CONV_SUCCESS',
      taskId,
      globalId: cached,
    });
  }

  try {
    // Ensure session
    let session = getSession(pageId);
    if (!session) {
      session = await initPage(pageId);
    }

    // Get doc_ids for GraphQL query
    const docIds = getDocIds();
    if (!docIds) {
      // Try to re-init to get doc_ids
      session = await initPage(pageId);
    }

    const globalId = await resolveGlobalId(session, pageId, threadId, isBusiness);

    if (globalId) {
      // Cache the result
      globalIdCache.set(`${pageId}:${threadId}`, globalId);
      // Also persist to chrome.storage
      saveToStorage(pageId, threadId, globalId);

      log.info(MODULE, `Resolved: ${threadId} → ${globalId}`);
      sendResponse({
        type: 'GET_GLOBAL_ID_FOR_CONV_SUCCESS',
        taskId,
        globalId,
      });
    } else {
      throw new Error('Could not resolve globalUserId');
    }
  } catch (err) {
    log.error(MODULE, 'Resolution failed:', err.message);
    sendResponse({
      type: 'GET_GLOBAL_ID_FOR_CONV_FAILURE',
      taskId,
      error: err.message,
    });
  }
}

/**
 * Resolve global ID via Facebook GraphQL
 * Uses PagesManagerInboxAdminAssignerRootQuery or similar query
 */
async function resolveGlobalId(session, pageId, threadId, isBusiness) {
  const docIds = getDocIds();

  // Try multiple query strategies
  const strategies = [
    () => queryViaThreadlist(session, pageId, threadId, docIds),
    () => queryViaInboxSearch(session, pageId, threadId),
    () => queryViaGraphQL(session, pageId, threadId),
  ];

  for (const strategy of strategies) {
    try {
      const result = await strategy();
      if (result) return result;
    } catch (err) {
      log.debug(MODULE, `Strategy failed: ${err.message}`);
    }
  }

  return null;
}

/**
 * Strategy 1: Query via MessengerThreadlistQuery doc_id
 */
async function queryViaThreadlist(session, pageId, threadId, docIds) {
  const queryName = 'MessengerThreadlistQuery';
  const docId = docIds?.[queryName] || docIds?.['LSPlatformGraphQLLightspeedRequestQuery'];

  if (!docId) {
    log.debug(MODULE, 'No doc_id found for threadlist query');
    return null;
  }

  const variables = JSON.stringify({
    pageId,
    threadIds: [threadId],
    limit: 1,
  });

  const params = {
    ...buildBaseParams(session),
    doc_id: docId,
    variables,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: queryName,
    server_timestamps: 'true',
  };

  const referer = `https://business.facebook.com/latest/inbox/all?page_id=${pageId}`;
  const response = await fetch(CONFIG.FB_GRAPHQL, {
    method: 'POST',
    headers: buildFbHeaders(referer),
    body: encodeFormData(params),
    credentials: 'include',
  });

  const text = await response.text();
  const result = parseFbRes(text);

  // Navigate response to find user ID
  return extractGlobalIdFromGraphQL(result);
}

/**
 * Strategy 2: Query via inbox search
 */
async function queryViaInboxSearch(session, pageId, threadId) {
  const params = {
    ...buildBaseParams(session),
    'thread_ids[0]': threadId,
    request_user_id: pageId,
  };

  const url = 'https://business.facebook.com/ajax/mercury/thread_info.php';
  const referer = `https://business.facebook.com/latest/inbox/all?page_id=${pageId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: buildFbHeaders(referer),
    body: encodeFormData(params),
    credentials: 'include',
  });

  const text = await response.text();
  const result = parseFbRes(text);

  // Look for participant user ID in thread info
  const threads = result?.payload?.threads;
  if (threads && threads.length > 0) {
    const participants = threads[0]?.participants || [];
    const customer = participants.find(p => p.fbid !== pageId);
    if (customer) return customer.fbid;
  }

  return null;
}

/**
 * Strategy 3: Direct GraphQL batch query
 */
async function queryViaGraphQL(session, pageId, threadId) {
  const variables = JSON.stringify({
    threadKey: `t_${threadId}`,
    pageId,
  });

  const params = {
    ...buildBaseParams(session),
    variables,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'PagesManagerInboxAdminAssignerRootQuery',
    server_timestamps: 'true',
  };

  // Try without doc_id (let FB route by friendly_name)
  const referer = `https://business.facebook.com/latest/inbox/all?page_id=${pageId}`;
  const response = await fetch(CONFIG.FB_GRAPHQL, {
    method: 'POST',
    headers: buildFbHeaders(referer),
    body: encodeFormData(params),
    credentials: 'include',
  });

  const text = await response.text();
  const result = parseFbRes(text);

  return extractGlobalIdFromGraphQL(result);
}

/**
 * Extract global user ID from GraphQL response
 * The response structure varies, so we try multiple paths
 */
function extractGlobalIdFromGraphQL(result) {
  if (!result) return null;

  // Path 1: data.node.messaging_actor.id
  const actor = result?.data?.node?.messaging_actor;
  if (actor?.id) return actor.id;

  // Path 2: data.message_thread.all_participants.nodes[].messaging_actor.id
  const participants = result?.data?.message_thread?.all_participants?.nodes;
  if (participants && participants.length > 0) {
    // Find the non-page participant
    for (const p of participants) {
      const id = p?.messaging_actor?.id;
      if (id && !p?.messaging_actor?.is_managed_page) {
        return id;
      }
    }
  }

  // Path 3: Walk the entire response looking for user-like IDs
  const found = deepFindGlobalId(result);
  if (found) return found;

  return null;
}

/**
 * Deep search for global user ID in nested response
 */
function deepFindGlobalId(obj, depth = 0) {
  if (depth > 8 || !obj || typeof obj !== 'object') return null;

  // Look for messaging_actor patterns
  if (obj.messaging_actor && obj.messaging_actor.id && !obj.messaging_actor.is_managed_page) {
    return obj.messaging_actor.id;
  }

  // Look for other_user_fbid
  if (obj.other_user_fbid) return String(obj.other_user_fbid);

  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null) {
      const found = deepFindGlobalId(value, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Save global ID to chrome.storage for persistence
 */
async function saveToStorage(pageId, threadId, globalId) {
  try {
    const key = `gid_${pageId}_${threadId}`;
    await chrome.storage.local.set({ [key]: { globalId, timestamp: Date.now() } });
  } catch (err) {
    log.debug(MODULE, 'Failed to save to storage:', err.message);
  }
}

/**
 * Load cached global IDs from chrome.storage on startup
 */
export async function loadCacheFromStorage() {
  try {
    const data = await chrome.storage.local.get(null);
    let count = 0;
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('gid_') && value?.globalId) {
        // Check TTL
        if (Date.now() - (value.timestamp || 0) < CONFIG.GLOBAL_ID_CACHE_TTL) {
          const parts = key.replace('gid_', '').split('_');
          const pageId = parts[0];
          const threadId = parts.slice(1).join('_');
          globalIdCache.set(`${pageId}:${threadId}`, value.globalId);
          count++;
        }
      }
    }
    if (count > 0) log.info(MODULE, `Loaded ${count} cached global IDs from storage`);
  } catch (err) {
    log.debug(MODULE, 'Failed to load cache from storage:', err.message);
  }
}
