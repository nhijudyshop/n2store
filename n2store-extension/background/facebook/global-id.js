// Facebook Global ID Resolver
// Handles GET_GLOBAL_ID_FOR_CONV - resolves thread_id to globalUserId via GraphQL
// 6 strategies matching Pancake Extension priority:
//   1. PagesManagerInboxAdminAssignerRootQuery (doc_id + commItemID) — Pancake #1
//   2. PagesManagerInboxQueryUtilCommItemHeaderMercuryQuery (cquick_token) — Pancake #2
//   3. MessengerThreadlistQuery (doc_id, our extra)
//   4. thread_info.php (mercury, our extra)
//   5. findThread — thread list search: main→done→page_background→spam→retry — Pancake #3
//   6. getUserInboxByName — BizInboxCustomerRelaySearchSourceQuery — Pancake #4
import { CONFIG } from '../../shared/config.js';
import { log } from '../../shared/logger.js';
import { initPage, getSession, getDocIds } from './session.js';
import { parseFbRes, buildBaseParams, encodeFormData, buildFbHeaders } from './utils.js';

const MODULE = 'FB-GlobalID';

// Persistent cache: threadId → globalId
const globalIdCache = new Map();

// Thread cache: avoid re-fetching thread lists (pageId:commItemId → thread node)
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
      threadKey,
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
 * Strategy order matches Pancake Extension priority
 */
async function resolveGlobalId(session, pageId, threadId, isBusiness, extra = {}) {
  const docIds = getDocIds();
  const { customerName, conversationUpdatedTime, threadKey } = extra;

  const strategies = [];

  // --- Pancake Strategy 1: PagesManagerInboxAdminAssignerRootQuery ---
  if (threadId && docIds?.['PagesManagerInboxAdminAssignerRootQuery']) {
    strategies.push({
      name: 'AdminAssignerRootQuery',
      fn: () => queryViaAdminAssigner(session, pageId, threadId, docIds),
    });
  }

  // --- Pancake Strategy 2: PagesManagerInboxQueryUtilCommItemHeaderMercuryQuery (cquick_token) ---
  if (threadKey && session.cquickToken && docIds?.['PagesManagerInboxQueryUtilCommItemHeaderMercuryQuery']) {
    strategies.push({
      name: 'CommItemHeaderMercuryQuery',
      fn: () => queryViaCommItemHeader(session, pageId, threadKey, docIds),
    });
  }

  // --- Our extra strategies ---
  if (threadId) {
    strategies.push({
      name: 'MessengerThreadlistQuery',
      fn: () => queryViaThreadlist(session, pageId, threadId, docIds),
    });
    strategies.push({
      name: 'thread_info.php',
      fn: () => queryViaInboxSearch(session, pageId, threadId),
    });
  }

  // --- Pancake Strategy 3: findThread (thread list search) ---
  if (threadId || customerName) {
    strategies.push({
      name: 'findThread',
      fn: () => findThread(session, pageId, docIds, {
        threadId,
        customerName,
        timeCursor: conversationUpdatedTime
          ? conversationUpdatedTime + 60000
          : Date.now(),
      }),
    });
  }

  // --- Pancake Strategy 4: getUserInboxByName ---
  if (customerName) {
    strategies.push({
      name: 'getUserInboxByName',
      fn: () => getUserInboxByName(session, pageId, docIds, customerName, threadId),
    });
  }

  for (const [i, strategy] of strategies.entries()) {
    try {
      const result = await strategy.fn();
      if (result) {
        log.info(MODULE, `Strategy ${i + 1}/${strategies.length} [${strategy.name}] succeeded`);
        return result;
      }
    } catch (err) {
      log.debug(MODULE, `Strategy ${i + 1}/${strategies.length} [${strategy.name}] failed: ${err.message}`);
    }
  }

  return null;
}

// ============================================================
// Strategy 1: PagesManagerInboxAdminAssignerRootQuery (Pancake #1)
// Uses doc_id + { pageID, commItemID } — NOT threadKey
// ============================================================
async function queryViaAdminAssigner(session, pageId, threadId, docIds) {
  const queryName = 'PagesManagerInboxAdminAssignerRootQuery';
  const docId = docIds?.[queryName];

  if (!docId) {
    log.debug(MODULE, `No doc_id for ${queryName}`);
    return null;
  }

  const variables = JSON.stringify({
    pageID: pageId,
    commItemID: threadId,
  });

  const params = {
    ...buildBaseParams(session),
    av: pageId,
    doc_id: docId,
    variables,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: queryName,
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

  // Check for rate limit — don't delete doc_id
  if (result?.errors?.some(e => /rate limit/i.test(e.message))) {
    log.debug(MODULE, `${queryName}: rate limited`);
    return null;
  }

  // Pancake path: data.commItem.target_id
  if (result?.data?.commItem?.target_id) {
    return result.data.commItem.target_id;
  }

  return null;
}

// ============================================================
// Strategy 2: PagesManagerInboxQueryUtilCommItemHeaderMercuryQuery (Pancake #2)
// Uses cquick_token + { pageID, messageThreadID }
// ============================================================
async function queryViaCommItemHeader(session, pageId, threadKey, docIds) {
  const queryName = 'PagesManagerInboxQueryUtilCommItemHeaderMercuryQuery';
  const docId = docIds?.[queryName];

  if (!docId || !session.cquickToken) {
    log.debug(MODULE, `No doc_id or cquick_token for ${queryName}`);
    return null;
  }

  const variables = JSON.stringify({
    pageID: pageId,
    messageThreadID: threadKey,
  });

  const params = {
    ...buildBaseParams(session),
    av: pageId,
    doc_id: docId,
    variables,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: queryName,
    // CQuick params (Pancake's compat iframe mechanism)
    cquick: 'jsc_c_d',
    cquick_token: session.cquickToken,
    ctarget: 'https%3A%2F%2Fwww.facebook.com',
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

  // Check for rate limit
  if (result?.errors?.some(e => /rate limit/i.test(e.message))) {
    log.debug(MODULE, `${queryName}: rate limited`);
    return null;
  }

  // Pancake path: data.page.page_comm_item_for_message_thread.target_id
  const targetId = result?.data?.page?.page_comm_item_for_message_thread?.target_id;
  if (targetId) return targetId;

  // Fallback: data.commItem.target_id
  if (result?.data?.commItem?.target_id) {
    return result.data.commItem.target_id;
  }

  return null;
}

// ============================================================
// Strategy 3: Query via MessengerThreadlistQuery doc_id (our extra)
// ============================================================
async function queryViaThreadlist(session, pageId, threadId, docIds) {
  const queryName = 'MessengerThreadlistQuery';
  const docId = docIds?.[queryName] || docIds?.['MessengerThreadlistWebGraphQLQuery'];

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
// Strategy 4: Query via inbox search (thread_info.php) (our extra)
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
// Strategy 5: findThread — load thread list, match by name/id (Pancake #3)
// Category chain: main → done → page_background → spam → retry(now)
// Uses MessengerThreadlistWebGraphQLQuery / MessengerThreadlistQuery doc_id
// ============================================================

// Category progression: Pancake searches all 5 steps
const CATEGORY_CHAIN = ['main', 'done', 'page_background', 'spam'];

async function findThread(session, pageId, docIds, opts) {
  const {
    threadId, customerName, timeCursor,
    count = 0, category = 'main', isRetryWithNow = false,
  } = opts;

  // Check thread cache first
  if (threadId) {
    const cacheKey = `${pageId}:${threadId}`;
    if (threadCache.has(cacheKey)) {
      const cached = threadCache.get(cacheKey);
      return cached.thread_key?.other_user_id || null;
    }
  }

  // Need doc_id: try MessengerThreadlistWebGraphQLQuery first (Pancake primary), then fallback
  const docId = docIds?.['MessengerThreadlistWebGraphQLQuery']
    || docIds?.['MessengerThreadlistQuery']
    || docIds?.['MessengerGraphQLThreadlistFetcher']
    || docIds?.['MessengerGraphQLThreadFetcher'];

  if (!docId) {
    log.debug(MODULE, 'No doc_id for threadlist fetcher');
    return null;
  }

  // Map category to FB tags (matching Pancake exactly)
  const tagsMap = {
    main: ['INBOX'],
    done: ['ARCHIVED'],
    page_background: ['PAGE_BACKGROUND'],
    spam: ['OTHER'],
  };
  const tags = tagsMap[category] || ['INBOX'];

  const referer = `https://business.facebook.com/latest/inbox/all?page_id=${pageId}`;

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
    headers: buildFbHeaders(referer),
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
    return _tryNextCategory(session, pageId, docIds, opts);
  }

  // Cache all threads for future lookups
  for (const node of nodes) {
    const commId = node.page_comm_item?.id;
    if (commId) {
      threadCache.set(`${pageId}:${commId}`, node);
    }
    // Also cache by comm_source_id
    const commSourceId = node.page_comm_item?.comm_source_id;
    if (commSourceId && commSourceId !== commId) {
      threadCache.set(`${pageId}:${commSourceId}`, node);
    }
  }

  // Search for matching thread
  let found = null;

  for (const node of nodes) {
    // Check isAllActorArePage (Pancake: both participants are Pages)
    if (_isAllActorArePage(node) && threadId) {
      const participantIds = (node.all_participants?.edges || [])
        .map(e => e?.node?.messaging_actor?.id);
      if (participantIds.includes(threadId)) {
        found = node;
        break;
      }
    }

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
    return _extractGlobalIdFromThread(found, pageId);
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
  return _tryNextCategory(session, pageId, docIds, opts);
}

/**
 * Progress to next category in chain: main → done → page_background → spam → retry(now)
 */
function _tryNextCategory(session, pageId, docIds, opts) {
  const { category = 'main', isRetryWithNow = false } = opts;

  const currentIdx = CATEGORY_CHAIN.indexOf(category);
  const nextIdx = currentIdx + 1;

  if (nextIdx < CATEGORY_CHAIN.length) {
    // Move to next category
    return findThread(session, pageId, docIds, {
      ...opts,
      category: CATEGORY_CHAIN[nextIdx],
      count: 0,
      timeCursor: opts.timeCursor, // keep original cursor
    });
  }

  // All categories exhausted — Pancake retries from 'main' with current timestamp
  if (!isRetryWithNow) {
    log.debug(MODULE, 'findThread: all categories exhausted, retrying from main with current time');
    return findThread(session, pageId, docIds, {
      ...opts,
      category: 'main',
      count: 0,
      timeCursor: Date.now(),
      isRetryWithNow: true,
    });
  }

  // Already retried with current time — give up
  return null;
}

/**
 * Check if all participants in a thread are Pages (Pancake: isAllActorArePage)
 */
function _isAllActorArePage(thread) {
  const edges = thread.all_participants?.edges;
  if (!edges || edges.length !== 2) return false;
  return !edges.find(e => e?.node?.messaging_actor?.__typename !== 'Page');
}

/**
 * Extract global ID from a found thread node
 */
function _extractGlobalIdFromThread(thread, pageId) {
  // Primary: thread_key.other_user_id (Pancake's main approach)
  const otherId = thread.thread_key?.other_user_id;
  if (otherId) {
    log.info(MODULE, `findThread: found via thread_key.other_user_id=${otherId}`);
    return otherId;
  }

  // Fallback: extract from participants (non-page actor)
  const edges = thread.all_participants?.edges || [];
  for (const edge of edges) {
    const actor = edge?.node?.messaging_actor;
    if (actor?.id && String(actor.id) !== String(pageId)) {
      // Skip if the actor is a managed page (unless isAllActorArePage)
      if (!actor.is_managed_page || _isAllActorArePage(thread)) {
        log.info(MODULE, `findThread: found via participant=${actor.id}`);
        return actor.id;
      }
    }
  }

  // Fallback: page_comm_item.target_id
  if (thread.page_comm_item?.target_id) {
    log.info(MODULE, `findThread: found via page_comm_item.target_id=${thread.page_comm_item.target_id}`);
    return thread.page_comm_item.target_id;
  }

  return null;
}

// ============================================================
// Strategy 6: getUserInboxByName — search customer by name (Pancake #4)
// Uses BizInboxCustomerRelaySearchSourceQuery (Pancake's actual query name)
// Fallback: PagesManagerInboxCustomerSearchQuery, PagesManagerInboxUnifiedCustomerSearchQuery
// ============================================================
async function getUserInboxByName(session, pageId, docIds, customerName, threadId) {
  if (!customerName) return null;

  // Try Pancake's actual query name first, then fallbacks
  let docId = docIds?.['BizInboxCustomerRelaySearchSourceQuery']
    || docIds?.['PagesManagerInboxCustomerSearchQuery']
    || docIds?.['PagesManagerInboxUnifiedCustomerSearchQuery'];

  // Determine the friendly name based on which doc_id we found
  let queryFriendlyName = 'BizInboxCustomerRelaySearchSourceQuery';
  if (!docIds?.['BizInboxCustomerRelaySearchSourceQuery']) {
    if (docIds?.['PagesManagerInboxCustomerSearchQuery']) {
      queryFriendlyName = 'PagesManagerInboxCustomerSearchQuery';
    } else if (docIds?.['PagesManagerInboxUnifiedCustomerSearchQuery']) {
      queryFriendlyName = 'PagesManagerInboxUnifiedCustomerSearchQuery';
    }
  }

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

      // Extract doc_ids from HTML — look for customer search queries
      const regex = /"docID":"(\d+)","queryName":"([^"]+)"/g;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const name = match[2];
        if (name.includes('BizInboxCustomerRelay') || name.includes('CustomerSearch') || name.includes('UnifiedCustomerSearch')) {
          docId = match[1];
          queryFriendlyName = name;
          log.info(MODULE, `Found CustomerSearch doc_id: ${docId} (${name})`);
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
    fb_api_req_friendly_name: queryFriendlyName,
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

  // Path 1: data.commItem.target_id (Pancake's AdminAssigner path)
  if (result?.data?.commItem?.target_id) {
    return result.data.commItem.target_id;
  }

  // Path 2: data.node.messaging_actor.id
  const actor = result?.data?.node?.messaging_actor;
  if (actor?.id) return actor.id;

  // Path 3: data.message_thread.all_participants.nodes[].messaging_actor.id
  const participants = result?.data?.message_thread?.all_participants?.nodes;
  if (participants && participants.length > 0) {
    for (const p of participants) {
      const id = p?.messaging_actor?.id;
      if (id && !p?.messaging_actor?.is_managed_page) {
        return id;
      }
    }
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
