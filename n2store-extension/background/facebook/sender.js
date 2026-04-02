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
    const response = await fetch(CONFIG.FB_MESSAGING_SEND, {
      method: 'POST',
      headers: buildFbHeaders(referer),
      body: encodeFormData(params),
      credentials: 'include',
    });

    const text = await response.text();
    let result;
    try {
      result = parseFbRes(text);
    } catch (e) {
      log.error(MODULE, 'Failed to parse FB response:', text.substring(0, 200));
      throw new Error('Failed to parse Facebook response');
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
