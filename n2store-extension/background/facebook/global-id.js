// Facebook Global ID Resolver
// Handles GET_GLOBAL_ID_FOR_CONV - resolves thread_id to globalUserId via GraphQL
// 5 strategies (matching Pancake Extension):
//   1. MessengerThreadlistQuery (doc_id)
//   2. thread_info.php (mercury)
//   3. PagesManagerInboxAdminAssignerRootQuery (GraphQL friendly_name)
//   4. findThread - load thread list, match by threadId/customerName (Pancake style)
//   5. getUserInboxByName - search customer by name (Pancake style)
import { CONFIG } from '../../shared/config.js';
import { log } from '../../shared/logger.js';
import { initPage, getSession, getDocIds } from './session.js';
import { parseFbRes, buildBaseParams, encodeFormData, buildFbHeaders } from './utils.js';

const MODULE = 'FB-GlobalID';

// Persistent cache: threadId → globalId
const globalIdCache = new Map();

// Thread cache: avoid re-fetching thread lists
const threadCache = new Map();

/**
 * Handle GET_GLOBAL_ID_FOR_CONV message
 * Resolves a conversation thread_id to a Facebook global user ID
 */
export async function handleGetGlobalIdForConv(data, sendResponse) {
  const {
    pageId, threadId, threadKey, isBusiness = true, taskId,
    customerName, conversationUpdatedTime,
  } = data;

  log.info(MODULE, `Resolving global ID: page=${pageId}, thread=${threadId}, name=${customerName || '?'}`);

  if (!pageId) {
    return sendResponse({
      type: 'GET_GLOBAL_ID_FOR_CONV_FAILURE',
      taskId,
      error: 'pageId required',
    });
  }

  // Need at least threadId or customerName
  if (!threadId && !customerName) {
    return sendResponse({
      type: 'GET_GLOBAL_ID_FOR_CONV_FAILURE',
      taskId,
      error: 'threadId or customerName required',
    });
  }

  // Check cache
  if (threadId) {
    const cached = globalIdCache.get(`${pageId}:${threadId}`);
    if (cached) {
      log.info(MODULE, `Cache hit: ${threadId} → ${cached}`);
      return sendResponse({
        type: 'GET_GLOBAL_ID_FOR_CONV_SUCCESS',
        taskId,
        globalId: cached,
      });
    }
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
      session = await initPage(pageId);
    }

    const globalId = await resolveGlobalId(session, pageId, threadId, isBusiness, {
      customerName,
      conversationUpdatedTime,
    });

    if (globalId) {
      // Cache the result
      if (threadId) {
        globalIdCache.set(`${pageId}:${threadId}`, globalId);
        saveToStorage(pageId, threadId, globalId);
      }

      log.info(MODULE, `Resolved: ${threadId || customerName} → ${globalId}`);
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
 * Uses 5 strategies in order (matching Pancake Extension)
 */
async function resolveGlobalId(session, pageId, threadId, isBusiness, extra = {}) {
  const docIds = getDocIds();
  const { customerName, conversationUpdatedTime } = extra;

  // Strategies that require threadId
  const strategies = [];

  if (threadId) {
    strategies.push(
      () => queryViaThreadlist(session, pageId, threadId, docIds),
      () => queryViaInboxSearch(session, pageId, threadId),
      () => queryViaGraphQL(session, pageId, threadId),
    );
  }

  // Strategy 4: findThread — works with threadId OR customerName
  if (threadId || customerName) {
    strategies.push(
      () => findThread(session, pageId, docIds, {
        threadId,
        customerName,
        timeCursor: conversationUpdatedTime
          ? conversationUpdatedTime + 60000
          : Date.now(),
      }),
    );
  }

  // Strategy 5: getUserInboxByName — only needs customerName
  if (customerName) {
    strategies.push(
      () => getUserInboxByName(session, pageId, docIds, customerName, threadId),
    );
  }

  for (const [i, strategy] of strategies.entries()) {
    try {
      const result = await strategy();
      if (result) {
        log.info(MODULE, `Strategy ${i + 1} succeeded`);
        return result;
      }
    } catch (err) {
      log.debug(MODULE, `Strategy ${i + 1} failed: ${err.message}`);
    }
  }

  return null;
}

// ============================================================
// Strategy 1: Query via MessengerThreadlistQuery doc_id
// ============================================================
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

  return extractGlobalIdFromGraphQL(result);
}

// ============================================================
// Strategy 2: Query via inbox search (thread_info.php)
// ============================================================
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

  const threads = result?.payload?.threads;
  if (threads && threads.length > 0) {
    const participants = threads[0]?.participants || [];
    const customer = participants.find(p => p.fbid !== pageId);
    if (customer) return customer.fbid;
  }

  return null;
}

// ============================================================
// Strategy 3: PagesManagerInboxAdminAssignerRootQuery
// ============================================================
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

  const referer = `https://business.facebook.com/latest/inbox/all?page_id=${pageId}`;
  const response = await fetch(CONFIG.FB_GRAPHQL, {
    method: 'POST',
    headers: buildFbHeaders(referer),
    body: encodeFormData(params),
    credentials: 'include',
  });

  const text = await response.text();
  const result = parseFbRes(text);

  // Pancake path: data.commItem.target_id
  if (result?.data?.commItem?.target_id) {
    return result.data.commItem.target_id;
  }

  return extractGlobalIdFromGraphQL(result);
}

// ============================================================
// Strategy 4: findThread — load thread list, match by name/id
// Reverse-engineered from Pancake Extension's Fe.findThread()
// Uses MessengerGraphQLThreadlistFetcher batch query
// ============================================================
async function findThread(session, pageId, docIds, opts) {
  const { threadId, customerName, timeCursor, count = 0, category = 'main' } = opts;

  // Check thread cache first
  if (threadId) {
    const cacheKey = `${pageId}:${threadId}`;
    if (threadCache.has(cacheKey)) {
      const cached = threadCache.get(cacheKey);
      return cached.thread_key?.other_user_id || null;
    }
  }

  // Need doc_id for MessengerGraphQLThreadlistFetcher
  const docId = docIds?.['MessengerGraphQLThreadlistFetcher']
    || docIds?.['MessengerGraphQLThreadFetcher']
    || docIds?.['LSPlatformGraphQLLightspeedRequestQuery'];

  if (!docId) {
    log.debug(MODULE, 'No doc_id for threadlist fetcher');
    return null;
  }

  // Map category to FB tags
  const tagsMap = {
    main: ['INBOX'],
    done: ['ARCHIVED'],
    page_background: ['PAGE_BACKGROUND'],
    spam: ['OTHER'],
  };
  const tags = tagsMap[category] || ['INBOX', 'ARCHIVED'];

  const referer = `https://business.facebook.com/latest/inbox/all?page_id=${pageId}`;
  const headers = buildFbHeaders(referer);

  // Use graphqlbatch format (same as Pancake)
  const queryParams = JSON.stringify({
    limit: 20,
    tags,
    before: timeCursor || null,
    isWorkUser: false,
    includeDeliveryReceipts: true,
    includeSeqID: false,
    is_work_teamwork_not_putting_muted_in_unreads: false,
    threadlistViewFieldsOnly: false,
  });

  const params = {
    ...buildBaseParams(session),
    doc_id: docId,
    variables: queryParams,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'MessengerGraphQLThreadlistFetcher',
    server_timestamps: 'true',
  };

  const response = await fetch(CONFIG.FB_GRAPHQL, {
    method: 'POST',
    headers,
    body: encodeFormData(params),
    credentials: 'include',
  });

  const text = await response.text();
  const result = parseFbRes(text);

  // Extract thread nodes from response
  const nodes = result?.data?.viewer?.message_threads?.nodes
    || result?.data?.page?.message_threads?.nodes
    || [];

  if (nodes.length === 0) {
    log.debug(MODULE, `findThread: no threads in category=${category}`);
    // Try next category
    if (category === 'main') {
      return findThread(session, pageId, docIds, { ...opts, category: 'done', count });
    }
    return null;
  }

  // Cache all threads for future lookups
  for (const node of nodes) {
    const commId = node.page_comm_item?.id;
    if (commId) {
      threadCache.set(`${pageId}:${commId}`, node);
    }
  }

  // Search for matching thread
  let found = null;

  for (const node of nodes) {
    // Match by threadId (page_comm_item.id or comm_source_id)
    if (threadId) {
      const commId = node.page_comm_item?.id;
      const commSourceId = node.page_comm_item?.comm_source_id;
      if (commId === threadId || commSourceId === threadId) {
        found = node;
        break;
      }
    }

    // Match by customer name in participants
    if (customerName && !found) {
      const edges = node.all_participants?.edges || [];
      const names = edges.map(e => e?.node?.messaging_actor?.name).filter(Boolean);
      if (names.includes(customerName)) {
        found = node;
        break;
      }
    }
  }

  if (found) {
    // Extract global ID: thread_key.other_user_id (Pancake's approach)
    const otherId = found.thread_key?.other_user_id;
    if (otherId) {
      log.info(MODULE, `findThread: found via thread_key.other_user_id=${otherId}`);
      return otherId;
    }

    // Fallback: extract from participants
    const edges = found.all_participants?.edges || [];
    for (const edge of edges) {
      const actor = edge?.node?.messaging_actor;
      if (actor?.id && !actor.is_managed_page && String(actor.id) !== String(pageId)) {
        log.info(MODULE, `findThread: found via participant=${actor.id}`);
        return actor.id;
      }
    }

    // Fallback: page_comm_item.target_id
    if (found.page_comm_item?.target_id) {
      return found.page_comm_item.target_id;
    }
  }

  // Paginate: try more threads (max 200)
  if (count < 200 && nodes.length >= 20) {
    const lastNode = nodes[nodes.length - 1];
    const nextCursor = lastNode.updated_time_precise || lastNode.updated_at;
    if (nextCursor) {
      return findThread(session, pageId, docIds, {
        ...opts,
        timeCursor: nextCursor,
        count: count + nodes.length,
      });
    }
  }

  // Try next category
  if (category === 'main') {
    return findThread(session, pageId, docIds, { ...opts, category: 'done', count: 0 });
  }

  return null;
}

// ============================================================
// Strategy 5: getUserInboxByName — search customer by name
// Reverse-engineered from Pancake Extension's Fe.getUserInboxByName()
// Uses PagesManagerInboxCustomerSearchQuery
// ============================================================
async function getUserInboxByName(session, pageId, docIds, customerName, threadId) {
  if (!customerName) return null;

  // Try to find the right doc_id
  let docId = docIds?.['PagesManagerInboxCustomerSearchQuery']
    || docIds?.['PagesManagerInboxUnifiedCustomerSearchQuery'];

  // If no doc_id, try to load from inbox page
  if (!docId) {
    log.debug(MODULE, 'No doc_id for customer search, trying to load from inbox page');
    try {
      const inboxUrl = `https://business.facebook.com/latest/inbox/messenger?asset_id=${pageId}&mailbox_id=&thread_type=FB_MESSAGE`;
      const resp = await fetch(inboxUrl, {
        headers: { Accept: 'text/html' },
        credentials: 'include',
      });
      const html = await resp.text();

      // Extract doc_ids from HTML
      const regex = /"docID":"(\d+)","queryName":"([^"]+)"/g;
      let match;
      while ((match = regex.exec(html)) !== null) {
        if (match[2].includes('CustomerSearch') || match[2].includes('UnifiedCustomerSearch')) {
          docId = match[1];
          log.info(MODULE, `Found CustomerSearch doc_id: ${docId} (${match[2]})`);
          break;
        }
      }
    } catch (e) {
      log.debug(MODULE, 'Failed to load inbox page for doc_ids:', e.message);
    }
  }

  if (!docId) {
    log.debug(MODULE, 'No doc_id available for customer search');
    return null;
  }

  const variables = JSON.stringify({
    pageID: pageId,
    channel: 'MESSENGER',
    count: 5,
    cursor: null,
    searchTerm: customerName,
    selectedIgAssetId: null,
  });

  const params = {
    ...buildBaseParams(session),
    doc_id: docId,
    variables,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'PagesManagerInboxCustomerSearchQuery',
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

  // Navigate: data.page.page_unified_customer_search.edges[]
  const edges = result?.data?.page?.page_unified_customer_search?.edges || [];

  for (const edge of edges) {
    const fbComms = edge?.node?.unified_contact_comms_facebook?.edges || [];

    // If we have threadId, match by it
    if (threadId) {
      const match = fbComms.find(c => c?.node?.id === threadId);
      if (match?.node?.target_id) {
        log.info(MODULE, `getUserInboxByName: matched by threadId, target_id=${match.node.target_id}`);
        return match.node.target_id;
      }
    }

    // Otherwise return first result's target_id
    if (fbComms.length > 0 && fbComms[0]?.node?.target_id) {
      log.info(MODULE, `getUserInboxByName: first result target_id=${fbComms[0].node.target_id}`);
      return fbComms[0].node.target_id;
    }
  }

  // Deep search fallback
  const found = deepFindGlobalId(result);
  if (found) return found;

  return null;
}

// ============================================================
// Response extraction helpers
// ============================================================

/**
 * Extract global user ID from GraphQL response
 */
function extractGlobalIdFromGraphQL(result) {
  if (!result) return null;

  // Path 1: data.node.messaging_actor.id
  const actor = result?.data?.node?.messaging_actor;
  if (actor?.id) return actor.id;

  // Path 2: data.message_thread.all_participants.nodes[].messaging_actor.id
  const participants = result?.data?.message_thread?.all_participants?.nodes;
  if (participants && participants.length > 0) {
    for (const p of participants) {
      const id = p?.messaging_actor?.id;
      if (id && !p?.messaging_actor?.is_managed_page) {
        return id;
      }
    }
  }

  // Path 3: data.commItem.target_id (Pancake style)
  if (result?.data?.commItem?.target_id) {
    return result.data.commItem.target_id;
  }

  // Path 4: Walk the entire response looking for user-like IDs
  const found = deepFindGlobalId(result);
  if (found) return found;

  return null;
}

/**
 * Deep search for global user ID in nested response
 */
function deepFindGlobalId(obj, depth = 0) {
  if (depth > 8 || !obj || typeof obj !== 'object') return null;

  if (obj.messaging_actor && obj.messaging_actor.id && !obj.messaging_actor.is_managed_page) {
    return obj.messaging_actor.id;
  }

  if (obj.other_user_fbid) return String(obj.other_user_fbid);

  // Pancake: thread_key.other_user_id
  if (obj.thread_key?.other_user_id) return String(obj.thread_key.other_user_id);

  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null) {
      const found = deepFindGlobalId(value, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

// ============================================================
// Persistence
// ============================================================

async function saveToStorage(pageId, threadId, globalId) {
  try {
    const key = `gid_${pageId}_${threadId}`;
    await chrome.storage.local.set({ [key]: { globalId, timestamp: Date.now() } });
  } catch (err) {
    log.debug(MODULE, 'Failed to save to storage:', err.message);
  }
}

export async function loadCacheFromStorage() {
  try {
    const data = await chrome.storage.local.get(null);
    let count = 0;
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('gid_') && value?.globalId) {
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
