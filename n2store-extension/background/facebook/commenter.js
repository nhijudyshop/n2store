// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Facebook Comment & Private Reply Handlers
// Phase 2: SEND_COMMENT, SEND_PRIVATE_REPLY
import { CONFIG } from '../../shared/config.js';
import { log } from '../../shared/logger.js';
import { initPage, getSession } from './session.js';
import { parseFbRes, buildBaseParams, buildFbHeaders, encodeFormData } from './utils.js';

const MODULE = 'FB-Commenter';

/**
 * Handle SEND_COMMENT message
 * Posts a comment on a Facebook post/comment via Business Suite
 *
 * @param {Object} data - { pageId, postId, commentId (reply-to parent), message, taskId }
 * @param {Function} sendResponse
 */
export async function handleSendComment(data, sendResponse) {
  const { pageId, postId, commentId, message, taskId } = data;

  log.info(MODULE, `Sending comment: page=${pageId}, post=${postId}, reply_to=${commentId || 'root'}`);

  if (!pageId) return sendResponse({ type: 'SEND_COMMENT_FAILURE', taskId, error: 'pageId required' });
  if (!postId && !commentId) return sendResponse({ type: 'SEND_COMMENT_FAILURE', taskId, error: 'postId or commentId required' });
  if (!message) return sendResponse({ type: 'SEND_COMMENT_FAILURE', taskId, error: 'message required' });

  try {
    let session = getSession(pageId);
    if (!session) {
      session = await initPage(pageId);
    }

    const baseParams = buildBaseParams(session);

    // Build comment params
    const params = {
      ...baseParams,
      ft_ent_identifier: postId || commentId,
      comment_text: message,
      source: 2,  // 2 = comment box
      client_id: `${Date.now()}:${Math.floor(Math.random() * 4294967295)}`,
      reply_fbid: commentId || '',
      parent_comment_id: commentId || '',
      rootcomment_fbid: '',
      comment_logging: '{}',
      av: pageId,  // Acting viewer = page
    };

    const referer = `https://business.facebook.com/latest/inbox/all?page_id=${pageId}`;
    const headers = buildFbHeaders(referer, session.msgrRegion);

    log.info(MODULE, `[DEBUG] POST ${CONFIG.FB_COMMENT_ADD}`);

    const response = await fetch(CONFIG.FB_COMMENT_ADD, {
      method: 'POST',
      headers,
      body: encodeFormData(params),
      credentials: 'include',
    });

    const text = await response.text();
    log.info(MODULE, `[DEBUG] Comment response (${text.length} chars): ${text.substring(0, 300)}`);

    let result;
    try {
      result = parseFbRes(text);
    } catch (e) {
      throw new Error(`Failed to parse comment response: ${e.message}`);
    }

    if (result.error) {
      throw new Error(result.error.message || result.error.summary || 'Facebook comment error');
    }

    // Extract comment ID from response
    const newCommentId = result?.payload?.comment_id
      || result?.payload?.id
      || result?.jsmods?.require?.[0]?.[3]?.[1]?.commentID
      || null;

    log.info(MODULE, `Comment success: commentId=${newCommentId}`);

    sendResponse({
      type: 'SEND_COMMENT_SUCCESS',
      taskId,
      commentId: newCommentId,
    });
  } catch (err) {
    log.error(MODULE, 'Comment failed:', err.message);
    sendResponse({
      type: 'SEND_COMMENT_FAILURE',
      taskId,
      error: err.message,
    });
  }
}

/**
 * Handle SEND_PRIVATE_REPLY message
 * Sends a private reply to a comment via Facebook GraphQL
 *
 * @param {Object} data - { pageId, commentId, message, taskId }
 * @param {Function} sendResponse
 */
export async function handleSendPrivateReply(data, sendResponse) {
  const { pageId, commentId, message, taskId } = data;

  log.info(MODULE, `Sending private reply: page=${pageId}, comment=${commentId}`);

  if (!pageId) return sendResponse({ type: 'SEND_PRIVATE_REPLY_FAILURE', taskId, error: 'pageId required' });
  if (!commentId) return sendResponse({ type: 'SEND_PRIVATE_REPLY_FAILURE', taskId, error: 'commentId required' });
  if (!message) return sendResponse({ type: 'SEND_PRIVATE_REPLY_FAILURE', taskId, error: 'message required' });

  try {
    let session = getSession(pageId);
    if (!session) {
      session = await initPage(pageId);
    }

    const baseParams = buildBaseParams(session);

    // Use GraphQL to send private reply
    const variables = JSON.stringify({
      input: {
        comment_id: commentId,
        message: { text: message },
        actor_id: pageId,
        client_mutation_id: String(Date.now()),
      },
    });

    const params = {
      ...baseParams,
      fb_api_req_friendly_name: 'PagesManagerInboxPrivateReplyMutation',
      variables,
      doc_id: '', // Will use friendly_name routing
      av: pageId,
    };

    const referer = `https://business.facebook.com/latest/inbox/all?page_id=${pageId}`;
    const headers = buildFbHeaders(referer, session.msgrRegion);

    log.info(MODULE, `[DEBUG] POST ${CONFIG.FB_GRAPHQL} (PagesManagerInboxPrivateReplyMutation)`);

    const response = await fetch(CONFIG.FB_GRAPHQL, {
      method: 'POST',
      headers,
      body: encodeFormData(params),
      credentials: 'include',
    });

    const text = await response.text();
    log.info(MODULE, `[DEBUG] Private reply response (${text.length} chars): ${text.substring(0, 300)}`);

    let result;
    try {
      result = parseFbRes(text);
    } catch (e) {
      throw new Error(`Failed to parse private reply response: ${e.message}`);
    }

    if (result.error || result.errors) {
      const errMsg = result.error?.message || result.errors?.[0]?.message || 'Facebook private reply error';
      throw new Error(errMsg);
    }

    const threadId = result?.data?.page_private_reply?.thread_id || null;

    log.info(MODULE, `Private reply success: threadId=${threadId}`);

    sendResponse({
      type: 'SEND_PRIVATE_REPLY_SUCCESS',
      taskId,
      threadId,
    });
  } catch (err) {
    log.error(MODULE, 'Private reply failed:', err.message);
    sendResponse({
      type: 'SEND_PRIVATE_REPLY_FAILURE',
      taskId,
      error: err.message,
    });
  }
}
