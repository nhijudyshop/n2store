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
    // IMPORTANT: __user must be pageId (not admin userId) when sending as a page
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
    // Override __user to pageId (Pancake Extension does this)
    params.__user = pageId;

    // Send the message
    const referer = `${CONFIG.FB_BUSINESS_INBOX}?page_id=${pageId}`;
    const headers = buildFbHeaders(referer);
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

    log.info(MODULE, `[DEBUG] Parsed result keys: ${Object.keys(result).join(', ')}`);
    if (result.error) {
      log.info(MODULE, `[DEBUG] FB error object: ${JSON.stringify(result.error).substring(0, 500)}`);
    }
    if (result.payload) {
      log.info(MODULE, `[DEBUG] Payload actions: ${JSON.stringify(result.payload?.actions?.map(a => a.message_id)).substring(0, 200)}`);
    }

    // Check for errors in response
    if (result.error) {
      const fbError = result.error;
      log.error(MODULE, `FB error: code=${fbError.code}, subcode=${fbError.error_subcode}`, fbError.message);

      // Determine retry strategy
      const strategy = getRetryStrategy(fbError);
      if (strategy === 'restartInbox') {
        log.info(MODULE, 'Retrying with session restart...');
        session = await initPage(pageId);
        // Retry once
        params.fb_dtsg = session.token;
        params.__user = pageId;
        const retryRes = await fetch(CONFIG.FB_MESSAGING_SEND, {
          method: 'POST',
          headers: buildFbHeaders(referer),
          body: encodeFormData(params),
          credentials: 'include',
        });
        const retryText = await retryRes.text();
        result = parseFbRes(retryText);
        if (result.error) throw new Error(result.error.message || 'Retry failed');
      } else {
        throw new Error(fbError.message || `FB Error ${fbError.code}/${fbError.error_subcode}`);
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

  const params = {
    ...buildBaseParams(session),
    body: message || '',
    has_attachment: files && files.length > 0 ? 'true' : 'false',
    'specific_to_list[0]': `fbid:${globalUserId}`,
    'specific_to_list[1]': `fbid:${pageId}`,
    other_user_fbid: globalUserId,
    offline_threading_id: offlineThreadingId,
    message_id: offlineThreadingId,
    source: 'source:titan:web',
    timestamp: Date.now().toString(),
    'ui_push_phase': 'V3',
    request_user_id: pageId,
    'tags[0]': 'page_messaging',
    ephemeral_ttl_mode: '0',
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
 * Determine retry strategy based on Facebook error
 */
function getRetryStrategy(fbError) {
  const subcode = fbError.error_subcode;

  if (subcode === FB_ERRORS.TEMPORARY_ERROR.subcode) return 'restartInbox';
  if (subcode === FB_ERRORS.BLOCKED_RETRY_SOCKET.subcode) return 'retryUsingSocket';
  if (subcode === FB_ERRORS.UPLOAD_BLOCKED.subcode) return 'reuploadPhotos';
  if (subcode === FB_ERRORS.RATE_LIMITED.subcode) return 'cannotRetry';

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
