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
import { initPage, getSession, getDocIds, waitForDocIds } from './session.js';
import { parseFbRes, buildBaseParams, encodeFormData, buildFbHeaders } from './utils.js';

// Alternative query names — Facebook renames these periodically
// PagesManager* → BusinessComet*/BizInbox* (2024+)
const ADMIN_ASSIGNER_NAMES = [
  'PagesManagerInboxAdminAssignerRootQuery',
  'BusinessCometInboxThreadDetailHeaderQuery',
  'BizInboxThreadDetailHeaderQuery',
];
const COMM_ITEM_HEADER_NAMES = [
  'PagesManagerInboxQueryUtilCommItemHeaderMercuryQuery',
  'BusinessCometInboxQueryUtilCommItemHeaderMercuryQuery',
];
const THREADLIST_NAMES = [
  'MessengerThreadlistWebGraphQLQuery',
  'MessengerThreadlistQuery',
  'MessengerGraphQLThreadlistFetcher',
  'MessengerGraphQLThreadFetcher',
  'useMWGetFetchUserThreadNavigationDataQuery',
];
const CUSTOMER_SEARCH_NAMES = [
  'BizInboxCustomerRelaySearchSourceQuery',
  'PagesManagerInboxCustomerSearchQuery',
  'PagesManagerInboxUnifiedCustomerSearchQuery',
  'BizInboxSearchResultFacebookListQuery',
];

/**
 * Find first available doc_id from a list of alternative query names
 * Returns { docId, queryName } or { docId: null, queryName: fallbackName }
 */
function findDocId(docIds, alternatives) {
  if (!docIds) return { docId: null, queryName: alternatives[0] };
  for (const name of alternatives) {
    if (docIds[name]) return { docId: docIds[name], queryName: name };
  }
  return { docId: null, queryName: alternatives[0] };
}

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

    // Wait for JS bundle doc_id extraction to finish (runs in background after initPage)
    await waitForDocIds();

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

  const adminAssigner = findDocId(docIds, ADMIN_ASSIGNER_NAMES);
  const commItemHeader = findDocId(docIds, COMM_ITEM_HEADER_NAMES);
  const threadlist = findDocId(docIds, THREADLIST_NAMES);
  const customerSearch = findDocId(docIds, CUSTOMER_SEARCH_NAMES);

  log.info(MODULE, `Available doc_ids: ${docIds ? Object.keys(docIds).length : 0}`);
  log.info(MODULE, `  adminAssigner: ${adminAssigner.docId ? adminAssigner.queryName : 'NONE'}`);
  log.info(MODULE, `  threadlist: ${threadlist.docId ? threadlist.queryName : 'NONE'}`);
  log.info(MODULE, `  customerSearch: ${customerSearch.docId ? customerSearch.queryName : 'NONE'}`);
  log.info(MODULE, `  cquickToken: ${session.cquickToken ? 'yes' : 'no'}`);

  // --- Strategy 1: AdminAssigner/ThreadDetailHeader (with doc_id) ---
  if (threadId && adminAssigner.docId) {
    strategies.push({
      name: `${adminAssigner.queryName} (doc_id)`,
      fn: () => queryViaAdminAssigner(session, pageId, threadId, adminAssigner.docId, adminAssigner.queryName),
    });
  }

  // --- Strategy 2: CommItemHeaderMercuryQuery (cquick_token) ---
  if (threadKey && session.cquickToken && commItemHeader.docId) {
    strategies.push({
      name: commItemHeader.queryName,
      fn: () => queryViaCommItemHeader(session, pageId, threadKey, commItemHeader.docId, commItemHeader.queryName),
    });
  }

  // --- Strategy 3: AdminAssigner WITHOUT doc_id (friendly_name only) ---
  if (threadId) {
    strategies.push({
      name: 'AdminAssigner (friendly_name)',
      fn: () => queryViaAdminAssignerFriendlyName(session, pageId, threadId),
    });
  }

  // --- Strategy 4: Conversation page scraping (no doc_id needed) ---
  if (threadId) {
    strategies.push({
      name: 'ConversationPage',
      fn: () => queryViaConversationPage(session, pageId, threadId),
    });
  }

  // --- Strategy 5: thread_info.php (Mercury, no doc_id needed) ---
  if (threadId) {
    strategies.push({
      name: 'thread_info.php',
      fn: () => queryViaInboxSearch(session, pageId, threadId),
    });
  }

  // --- Strategy 6: MessengerThreadlistQuery ---
  if (threadId && threadlist.docId) {
    strategies.push({
      name: threadlist.queryName,
      fn: () => queryViaThreadlist(session, pageId, threadId, threadlist.docId, threadlist.queryName),
    });
  }

  // --- Strategy 7: findThread (thread list search across categories) ---
  if ((threadId || customerName) && threadlist.docId) {
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

  // --- Strategy 8: getUserInboxByName (customer search) ---
  if (customerName) {
    strategies.push({
      name: 'getUserInboxByName',
      fn: () => getUserInboxByName(session, pageId, docIds, customerName, threadId),
    });
  }

  log.info(MODULE, `Trying ${strategies.length} strategies: ${strategies.map(s => s.name).join(', ')}`);

  for (const [i, strategy] of strategies.entries()) {
    try {
      log.info(MODULE, `[${i + 1}/${strategies.length}] Trying ${strategy.name}...`);
      const result = await strategy.fn();
      if (result) {
        log.info(MODULE, `[${i + 1}/${strategies.length}] ${strategy.name} → SUCCESS: ${result}`);
        return result;
      }
      log.info(MODULE, `[${i + 1}/${strategies.length}] ${strategy.name} → returned null`);
    } catch (err) {
      log.info(MODULE, `[${i + 1}/${strategies.length}] ${strategy.name} → ERROR: ${err.message}`);
    }
  }

  log.info(MODULE, 'All strategies exhausted, returning null');
  return null;
}

// ============================================================
// Strategy 1: AdminAssigner / ThreadDetailHeader (doc_id based)
// Tries: PagesManagerInboxAdminAssignerRootQuery, BusinessCometInboxThreadDetailHeaderQuery
// Uses doc_id + { pageID, commItemID } — NOT threadKey
// ============================================================
async function queryViaAdminAssigner(session, pageId, threadId, docId, queryName) {
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
  log.debug(MODULE, `${queryName}: response ${text.length} bytes, first 200: ${text.substring(0, 200)}`);

  const result = parseFbRes(text);

  // Check for rate limit
  if (result?.errors?.some(e => /rate limit/i.test(e.message))) {
    log.debug(MODULE, `${queryName}: rate limited`);
    return null;
  }

  // Log errors for debugging
  if (result?.errors?.length > 0) {
    log.info(MODULE, `${queryName}: GraphQL errors: ${JSON.stringify(result.errors.map(e => e.message || e.description || e.summary)).substring(0, 300)}`);
  }

  // Pancake path: data.commItem.target_id
  if (result?.data?.commItem?.target_id) {
    return result.data.commItem.target_id;
  }

  return extractGlobalIdFromGraphQL(result);
}

// ============================================================
// Strategy: AdminAssignerRootQuery WITHOUT doc_id (friendly_name fallback)
// Facebook sometimes resolves queries by name even without doc_id
// ============================================================
async function queryViaAdminAssignerFriendlyName(session, pageId, threadId) {
  const queryName = 'PagesManagerInboxAdminAssignerRootQuery';

  const variables = JSON.stringify({
    pageID: pageId,
    commItemID: threadId,
  });

  const params = {
    ...buildBaseParams(session),
    av: pageId,
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

  if (result?.data?.commItem?.target_id) {
    return result.data.commItem.target_id;
  }

  return extractGlobalIdFromGraphQL(result);
}

// ============================================================
// Strategy 2: CommItemHeaderMercuryQuery (Pancake #2)
// Uses cquick_token + { pageID, messageThreadID }
// ============================================================
async function queryViaCommItemHeader(session, pageId, threadKey, docId, queryName) {
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
  log.debug(MODULE, `${queryName}: response ${text.length} bytes`);
  const result = parseFbRes(text);

  if (result?.errors?.length > 0) {
    log.info(MODULE, `${queryName}: errors: ${JSON.stringify(result.errors.map(e => e.message || e.summary)).substring(0, 300)}`);
  }

  // Pancake path: data.page.page_comm_item_for_message_thread.target_id
  const targetId = result?.data?.page?.page_comm_item_for_message_thread?.target_id;
  if (targetId) return targetId;

  if (result?.data?.commItem?.target_id) {
    return result.data.commItem.target_id;
  }

  return extractGlobalIdFromGraphQL(result);
}

// ============================================================
// Strategy: Query via threadlist doc_id (direct thread lookup)
// ============================================================
async function queryViaThreadlist(session, pageId, threadId, docId, queryName) {
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
  log.debug(MODULE, `${queryName}: response ${text.length} bytes`);
  const result = parseFbRes(text);

  if (result?.errors?.length > 0) {
    log.info(MODULE, `${queryName}: errors: ${JSON.stringify(result.errors.map(e => e.message || e.summary)).substring(0, 300)}`);
  }

  return extractGlobalIdFromGraphQL(result);
}

// ============================================================
// Strategy: Fetch Business Suite conversation page, extract target_id from SSR data
// No doc_id needed — scrapes the HTML for embedded relay/preload data
// ============================================================
async function queryViaConversationPage(session, pageId, threadId) {
  // Load the actual Business Suite inbox page with the specific conversation selected
  const url = `https://business.facebook.com/latest/inbox/all?asset_id=${pageId}&selected_item_id=${threadId}&mailbox_id=&thread_type=FB_MESSAGE`;

  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    log.debug(MODULE, `ConversationPage: HTTP ${response.status}`);
    return null;
  }

  const html = await response.text();
  log.debug(MODULE, `ConversationPage: ${html.length} bytes`);

  // The SSR HTML contains preloaded relay data with participant information
  // Look for target_id near the thread context

  // Pattern 1: commItem + target_id in SSR data
  // "commItem":{"id":"THREADID",...,"target_id":"USERID"}
  const commItemRegex = /"commItem":\{[^}]*?"id":"[^"]*?"[^}]*?"target_id":"(\d+)"/g;
  let match;
  while ((match = commItemRegex.exec(html)) !== null) {
    if (match[1] !== pageId) {
      log.info(MODULE, `ConversationPage: found commItem.target_id=${match[1]}`);
      return match[1];
    }
  }

  // Pattern 2: target_id near the threadId
  // Find occurrences of threadId and look for target_id nearby
  const threadIdIndex = html.indexOf(`"${threadId}"`);
  if (threadIdIndex !== -1) {
    // Search in a window around the threadId mention
    const windowStart = Math.max(0, threadIdIndex - 500);
    const windowEnd = Math.min(html.length, threadIdIndex + 2000);
    const window = html.substring(windowStart, windowEnd);

    const targetMatch = window.match(/"target_id"\s*:\s*"(\d+)"/);
    if (targetMatch && targetMatch[1] !== pageId) {
      log.info(MODULE, `ConversationPage: found target_id=${targetMatch[1]} near threadId`);
      return targetMatch[1];
    }

    const otherUserMatch = window.match(/"other_user_id"\s*:\s*"?(\d+)/);
    if (otherUserMatch && otherUserMatch[1] !== pageId) {
      log.info(MODULE, `ConversationPage: found other_user_id=${otherUserMatch[1]} near threadId`);
      return otherUserMatch[1];
    }
  }

  // Pattern 3: All target_ids in the page, filter out page's own ID
  const allTargetIds = new Map(); // id → count
  const targetRegex = /"target_id"\s*:\s*"(\d+)"/g;
  while ((match = targetRegex.exec(html)) !== null) {
    if (match[1] !== pageId) {
      allTargetIds.set(match[1], (allTargetIds.get(match[1]) || 0) + 1);
    }
  }

  if (allTargetIds.size > 0) {
    // Return the most frequently appearing non-page target_id
    const sorted = [...allTargetIds.entries()].sort((a, b) => b[1] - a[1]);
    log.info(MODULE, `ConversationPage: ${allTargetIds.size} unique target_ids found, top: ${sorted.slice(0, 3).map(([id, c]) => `${id}(×${c})`).join(', ')}`);
    return sorted[0][0];
  }

  // Pattern 4: other_user_id anywhere
  const otherUserGlobal = html.match(/"other_user_id"\s*:\s*"?(\d+)/);
  if (otherUserGlobal && otherUserGlobal[1] !== pageId) {
    log.info(MODULE, `ConversationPage: found other_user_id=${otherUserGlobal[1]}`);
    return otherUserGlobal[1];
  }

  log.debug(MODULE, 'ConversationPage: no target_id found in HTML');
  return null;
}

// ============================================================
// Strategy: Query via inbox search (thread_info.php) (Mercury endpoint)
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
  log.debug(MODULE, `thread_info.php: HTTP ${response.status}, ${text.length} bytes, first 200: ${text.substring(0, 200)}`);

  const result = parseFbRes(text);

  // Log the response structure for debugging
  if (result?.payload) {
    log.debug(MODULE, `thread_info.php: payload keys: ${Object.keys(result.payload).join(', ')}`);
  }
  if (result?.error) {
    log.info(MODULE, `thread_info.php: error: ${result.error}`);
  }

  const threads = result?.payload?.threads;
  if (threads && threads.length > 0) {
    const participants = threads[0]?.participants || [];
    const customer = participants.find(p => p.fbid !== pageId && String(p.fbid) !== String(pageId));
    if (customer) {
      log.info(MODULE, `thread_info.php: found fbid=${customer.fbid}`);
      return String(customer.fbid);
    }
  }

  // Deep search fallback
  return deepFindGlobalId(result);
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

  // Try all known customer search query names
  const search = findDocId(docIds, CUSTOMER_SEARCH_NAMES);
  let docId = search.docId;
  let queryFriendlyName = search.queryName;

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
 * Handles both PagesManager* and BusinessComet* response formats
 */
function extractGlobalIdFromGraphQL(result) {
  if (!result) return null;

  // Path 1: data.commItem.target_id (Pancake's AdminAssigner path)
  if (result?.data?.commItem?.target_id) {
    return result.data.commItem.target_id;
  }

  // Path 2: data.node.target_id (BusinessComet thread detail)
  if (result?.data?.node?.target_id) {
    return result.data.node.target_id;
  }

  // Path 3: data.thread_detail.target_id
  if (result?.data?.thread_detail?.target_id) {
    return result.data.thread_detail.target_id;
  }

  // Path 4: data.page.page_comm_item.target_id
  if (result?.data?.page?.page_comm_item?.target_id) {
    return result.data.page.page_comm_item.target_id;
  }

  // Path 5: data.node.messaging_actor.id
  const actor = result?.data?.node?.messaging_actor;
  if (actor?.id) return actor.id;

  // Path 6: data.message_thread.all_participants.nodes[].messaging_actor.id
  const participants = result?.data?.message_thread?.all_participants?.nodes;
  if (participants && participants.length > 0) {
    for (const p of participants) {
      const id = p?.messaging_actor?.id;
      if (id && !p?.messaging_actor?.is_managed_page) {
        return id;
      }
    }
  }

  // Path 7: Deep search the entire response
  return deepFindGlobalId(result);
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
