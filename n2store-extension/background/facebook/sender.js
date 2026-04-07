// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Facebook Inbox Message Sender
// Handles REPLY_INBOX_PHOTO - the core bypass 24h messaging
import { CONFIG } from '../../shared/config.js';
import { ATTACHMENT_TYPES, FB_ERRORS } from '../../shared/constants.js';
import { log } from '../../shared/logger.js';
import { initPage, getSession } from './session.js';
import {
  parseFbRes,
  generateOfflineThreadingID,
  buildFbHeaders,
  buildBaseParams,
  encodeFormData,
} from './utils.js';

const MODULE = 'FB-Sender';

/**
 * Handle REPLY_INBOX_PHOTO message
 * This is the main entry point for sending messages via Facebook Business Suite
 */
export async function handleReplyInboxPhoto(data, sendResponse) {
  const {
    pageId,
    message,
    attachmentType = 'SEND_TEXT_ONLY',
    files = [],
    globalUserId,
    threadId,
    convId,
    platform = 'facebook',
    replyMessage = null,
    taskId,
    isBusiness = false,
    photoUrls = [],
    contentIds = [],
    tryResizeImage = true,
    accessToken,
  } = data;

  log.info(MODULE, `Sending message: type=${attachmentType}, page=${pageId}, thread=${threadId}`);

  // Validate
  if (!pageId) return sendResponse({ type: 'REPLY_INBOX_PHOTO_FAILURE', taskId, error: 'pageId required' });
  if (!globalUserId) return sendResponse({ type: 'REPLY_INBOX_PHOTO_FAILURE', taskId, error: 'globalUserId required' });
  if (!ATTACHMENT_TYPES.includes(attachmentType)) {
    return sendResponse({ type: 'REPLY_INBOX_PHOTO_FAILURE', taskId, error: `Invalid attachmentType: ${attachmentType}` });
  }

  try {
    // Ensure session is initialized
    let session = getSession(pageId);
    if (!session) {
      session = await initPage(pageId);
    }

    // Update dynamic rules for this request
    await updateDynamicRules(pageId);

    // Build send parameters
    // NOTE: __user stays as admin userId (from session.userId) - Pancake does this too
    // request_user_id = pageId tells Facebook which page is sending
    const params = buildSendParams({
      session,
      pageId,
      message,
      attachmentType,
      files,
      globalUserId,
      threadId,
      replyMessage,
      isBusiness,
    });

    // Send the message
    const referer = `${CONFIG.FB_BUSINESS_INBOX}?page_id=${pageId}`;
    const headers = buildFbHeaders(referer, session.msgrRegion);
    const body = encodeFormData(params);

    log.info(MODULE, `[DEBUG] POST ${CONFIG.FB_MESSAGING_SEND}`);
    log.info(MODULE, `[DEBUG] Session: fb_dtsg=${session.token?.substring(0, 15)}..., userId=${session.userId}, pageId=${pageId}`);
    log.info(MODULE, `[DEBUG] Params: globalUserId=${globalUserId}, threadId=${threadId}, attachmentType=${attachmentType}, body_len=${(message || '').length}`);

    // Check cookies
    try {
      const cookies = await chrome.cookies.getAll({ domain: '.facebook.com' });
      const cookieNames = cookies.map(c => c.name);
      const hasCUser = cookieNames.includes('c_user');
      const hasXs = cookieNames.includes('xs');
      log.info(MODULE, `[DEBUG] Cookies: total=${cookies.length}, c_user=${hasCUser}, xs=${hasXs}`);
      if (!hasCUser || !hasXs) {
        log.error(MODULE, '[DEBUG] CRITICAL: Missing Facebook session cookies! User may not be logged in.');
      }
    } catch (e) {
      log.warn(MODULE, `[DEBUG] Cannot read cookies: ${e.message}`);
    }

    log.info(MODULE, `[DEBUG] Request body (first 500): ${body.substring(0, 500)}`);

    const response = await fetch(CONFIG.FB_MESSAGING_SEND, {
      method: 'POST',
      headers,
      body,
      credentials: 'include',
    });

    log.info(MODULE, `[DEBUG] Response: status=${response.status} ${response.statusText}, type=${response.headers.get('content-type')}`);

    const text = await response.text();
    log.info(MODULE, `[DEBUG] Response body (${text.length} chars): ${text.substring(0, 500)}`);

    if (response.status !== 200) {
      throw new Error(`Facebook returned HTTP ${response.status}: ${text.substring(0, 200)}`);
    }

    let result;
    try {
      result = parseFbRes(text);
    } catch (e) {
      log.error(MODULE, `[DEBUG] Parse error: ${e.message}`);
      log.error(MODULE, `[DEBUG] Full response (first 1000 chars): ${text.substring(0, 1000)}`);
      throw new Error(`Failed to parse Facebook response: ${e.message}`);
    }

    // Log full result structure for debugging
    log.info(MODULE, `[DEBUG] Full result: ${JSON.stringify(result).substring(0, 1500)}`);
    log.info(MODULE, `[DEBUG] Result keys: ${Object.keys(result).join(', ')}`);
    log.info(MODULE, `[DEBUG] __ar=${result.__ar}, error=${JSON.stringify(result.error)}, errorSummary=${result.errorSummary}`);

    // Check for errors in response
    // Facebook errors can be in multiple formats:
    // 1. { error: { code, error_subcode, message } } - standard API error
    // 2. { error: 1545002 } - numeric error code
    // 3. { error: true, errorSummary: "..." } - boolean error with summary
    // 4. { __ar: 0, errorSummary: "..." } - no explicit error field but __ar=0
    const hasError = result.error || result.__ar === 0;
    if (hasError) {
      const errorInfo = extractFbError(result);
      log.error(MODULE, `FB error: ${JSON.stringify(errorInfo)}`);

      // Determine retry strategy
      const strategy = getRetryStrategy(errorInfo);
      if (strategy === 'restartInbox') {
        log.info(MODULE, 'Retrying with session restart...');
        session = await initPage(pageId);
        params.fb_dtsg = session.token;
        const retryRes = await fetch(CONFIG.FB_MESSAGING_SEND, {
          method: 'POST',
          headers: buildFbHeaders(referer, session.msgrRegion),
          body: encodeFormData(params),
          credentials: 'include',
        });
        const retryText = await retryRes.text();
        result = parseFbRes(retryText);
        const retryError = extractFbError(result);
        if (retryError) throw new Error(retryError.message);
      } else {
        throw new Error(errorInfo.message);
      }
    }

    // Extract message info from response
    const actions = result?.payload?.actions || [];
    const sentAction = actions.find(a => a.message_id);

    log.info(MODULE, `Message sent successfully: ${sentAction?.message_id || 'unknown'}`);

    sendResponse({
      type: 'REPLY_INBOX_PHOTO_SUCCESS',
      taskId,
      messageId: sentAction?.message_id || null,
      timestamp: sentAction?.timestamp || Date.now(),
      messageCreatedRange: sentAction?.message_created_range || null,
    });
  } catch (err) {
    log.error(MODULE, 'Send failed:', err.message);
    sendResponse({
      type: 'REPLY_INBOX_PHOTO_FAILURE',
      taskId,
      error: err.message,
    });
  }
}

/**
 * Build Facebook send parameters
 */
function buildSendParams({ session, pageId, message, attachmentType, files, globalUserId, threadId, replyMessage, isBusiness }) {
  const offlineThreadingId = generateOfflineThreadingID();

  // Match Pancake Extension's exact parameter format
  const params = {
    body: message || '',
    offline_threading_id: offlineThreadingId,
    source: 'source:page_unified_inbox',
    timestamp: Date.now().toString(),
    request_user_id: pageId,
    // Merge base params (fb_dtsg, __user=adminUserId, __a, __req, etc.)
    ...buildBaseParams(session),
    // Facebook-specific params (must match Pancake exactly)
    'specific_to_list[0]': `fbid:${globalUserId}`,
    'specific_to_list[1]': `fbid:${pageId}`,
    other_user_fbid: globalUserId,
    message_id: offlineThreadingId,
    client: 'mercury',
    action_type: 'ma-type:user-generated-message',
    ephemeral_ttl_mode: '0',
    has_attachment: files && files.length > 0 ? true : false,
  };

  // Add attachments based on type
  if (files && files.length > 0) {
    if (attachmentType === 'STICKER') {
      params.sticker_id = files[0];
    } else if (attachmentType === 'VIDEO') {
      files.forEach((id, i) => { params[`video_ids[${i}]`] = id; });
    } else if (attachmentType === 'FILE') {
      files.forEach((id, i) => { params[`file_ids[${i}]`] = id; });
    } else if (attachmentType === 'AUDIO') {
      files.forEach((id, i) => { params[`audio_ids[${i}]`] = id; });
    } else {
      // Default: PHOTO
      files.forEach((id, i) => { params[`image_ids[${i}]`] = id; });
    }
  }

  // Reply to specific message
  if (replyMessage && replyMessage.mid) {
    params.replied_to_message_id = replyMessage.mid;
  }

  return params;
}

/**
 * Extract error info from Facebook response (handles all formats)
 * Returns { code, subcode, message } or null if no error
 */
function extractFbError(result) {
  if (!result) return null;

  // No error
  if (!result.error && result.__ar !== 0) return null;

  const error = result.error;

  // Format 1: Standard API error object
  if (error && typeof error === 'object') {
    return {
      code: error.code || error.error_code,
      subcode: error.error_subcode || error.subcode,
      message: error.message || error.error_msg || error.errorSummary
        || result.errorSummary
        || `FB Error ${error.code || '?'}/${error.error_subcode || '?'}`,
    };
  }

  // Format 2: Numeric error code (e.g., { error: 1545002, errorSummary: "..." })
  if (typeof error === 'number') {
    return {
      code: error,
      subcode: error,
      message: result.errorSummary || result.errorDescription || `FB Error code: ${error}`,
    };
  }

  // Format 3: Boolean error (e.g., { error: true, errorSummary: "..." })
  if (error === true) {
    return {
      code: null,
      subcode: null,
      message: result.errorSummary || result.errorDescription || 'Facebook returned an error (no details)',
    };
  }

  // Format 4: String error
  if (typeof error === 'string') {
    return {
      code: null,
      subcode: null,
      message: error,
    };
  }

  // Format 5: __ar=0 without error field
  if (result.__ar === 0 && !error) {
    return {
      code: null,
      subcode: null,
      message: result.errorSummary || result.errorDescription || 'Facebook request failed (__ar=0)',
    };
  }

  return {
    code: null,
    subcode: null,
    message: `Unknown FB error: ${JSON.stringify(error).substring(0, 200)}`,
  };
}

/**
 * Determine retry strategy based on Facebook error
 */
function getRetryStrategy(errorInfo) {
  const subcode = errorInfo?.subcode;

  if (subcode === FB_ERRORS.TEMPORARY_ERROR.subcode) return 'restartInbox';
  if (subcode === FB_ERRORS.BLOCKED_RETRY_SOCKET.subcode) return 'retryUsingSocket';
  if (subcode === FB_ERRORS.UPLOAD_BLOCKED.subcode) return 'reuploadPhotos';
  if (subcode === FB_ERRORS.RATE_LIMITED.subcode) return 'cannotRetry';

  // For temporary/server errors, try restart
  const code = errorInfo?.code;
  if (code === 2 || code === 1) return 'restartInbox'; // FB temporary error codes

  return 'cannotRetry';
}

/**
 * Update dynamic declarativeNetRequest rules for messaging
 */
async function updateDynamicRules(pageId) {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [100, 101],
      addRules: [
        {
          id: 100,
          priority: 2,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Origin', operation: 'set', value: 'https://business.facebook.com' },
              { header: 'Referer', operation: 'set', value: `https://business.facebook.com/latest/inbox/all?page_id=${pageId}` },
            ],
          },
          condition: {
            urlFilter: '||business.facebook.com/messaging/send/',
            resourceTypes: ['xmlhttprequest'],
          },
        },
        {
          id: 101,
          priority: 2,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Origin', operation: 'set', value: 'https://business.facebook.com' },
              { header: 'Referer', operation: 'set', value: `https://business.facebook.com/latest/inbox/all?page_id=${pageId}` },
            ],
          },
          condition: {
            urlFilter: '||upload-business.facebook.com/',
            resourceTypes: ['xmlhttprequest'],
          },
        },
      ],
    });
  } catch (err) {
    log.warn(MODULE, 'Failed to update dynamic rules:', err.message);
  }
}
