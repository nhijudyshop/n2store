// Facebook Image Uploader
// Handles UPLOAD_INBOX_PHOTO - upload images to Facebook for inbox messages
import { CONFIG } from '../../shared/config.js';
import { log } from '../../shared/logger.js';
import { initPage, getSession } from './session.js';
import { parseFbRes, buildBaseParams, generateUploadFieldName } from './utils.js';

const MODULE = 'FB-Uploader';

/**
 * Handle UPLOAD_INBOX_PHOTO message
 * Downloads image from URL, uploads to Facebook, returns fbId
 */
export async function handleUploadInboxPhoto(data, sendResponse) {
  const { pageId, photoUrl, name = 'image.jpg', platform = 'facebook', taskId, uploadId } = data;

  log.info(MODULE, `Uploading image: page=${pageId}, url=${photoUrl?.substring(0, 80)}...`);

  if (!pageId) return sendResponse({ type: 'UPLOAD_INBOX_PHOTO_FAILURE', taskId, uploadId, error: 'pageId required' });
  if (!photoUrl) return sendResponse({ type: 'UPLOAD_INBOX_PHOTO_FAILURE', taskId, uploadId, error: 'photoUrl required' });

  try {
    // Ensure session
    let session = getSession(pageId);
    if (!session) {
      session = await initPage(pageId);
    }

    // Step 1: Download image blob
    const blob = await downloadBlob(photoUrl);
    log.info(MODULE, `Downloaded blob: ${blob.size} bytes, type=${blob.type}`);

    // Step 2: Upload to Facebook
    const result = await uploadToFacebook(blob, name, session, pageId);

    log.info(MODULE, `Upload success: fbId=${result.fbId}`);

    sendResponse({
      type: 'UPLOAD_INBOX_PHOTO_SUCCESS',
      taskId,
      uploadId,
      fbId: result.fbId,
      previewUri: result.previewUri || null,
    });
  } catch (err) {
    log.error(MODULE, 'Upload failed:', err.message);
    sendResponse({
      type: 'UPLOAD_INBOX_PHOTO_FAILURE',
      taskId,
      uploadId,
      error: err.message,
    });
  }
}

/**
 * Download image from URL as blob
 */
async function downloadBlob(url) {
  const response = await fetch(url, {
    credentials: 'omit',
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  return await response.blob();
}

/**
 * Upload blob to Facebook
 * POST to upload-business.facebook.com/ajax/mercury/upload.php
 */
async function uploadToFacebook(blob, filename, session, pageId) {
  const formData = new FormData();

  // Add base params
  const baseParams = buildBaseParams(session);
  for (const [key, value] of Object.entries(baseParams)) {
    if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  }

  // Add the file with a random field name (Facebook expects this pattern)
  const fieldName = generateUploadFieldName();
  formData.append(fieldName, blob, filename);

  // Add upload metadata
  formData.append('farr', fieldName);
  formData.append('upload_id', `upload_${Date.now()}`);
  // Associate upload with page context (so send-as-page can find the image)
  formData.append('request_user_id', pageId);
  formData.append('av', pageId);

  const referer = `https://business.facebook.com/latest/inbox/all?page_id=${pageId}`;

  const response = await fetch(CONFIG.FB_UPLOAD, {
    method: 'POST',
    headers: {
      'Accept': '*/*',
      'Referer': referer,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
    },
    body: formData,
    credentials: 'include',
  });

  log.info(MODULE, `[DEBUG] Upload response: status=${response.status}, type=${response.headers.get('content-type')}`);

  const text = await response.text();
  log.info(MODULE, `[DEBUG] Upload response body (${text.length} chars): ${text.substring(0, 500)}`);

  let result;
  try {
    result = parseFbRes(text);
  } catch (e) {
    log.error(MODULE, `[DEBUG] Upload parse error: ${e.message}`);
    log.error(MODULE, `[DEBUG] Full upload response: ${text.substring(0, 1000)}`);
    throw new Error(`Failed to parse Facebook upload response: ${e.message}`);
  }

  if (result.error) {
    throw new Error(result.error.message || 'Facebook upload error');
  }

  // Extract fbId from response
  // Facebook returns metadata as object {"0": {...}} or array [{...}]
  const metadata = result?.payload?.metadata;
  if (metadata) {
    const first = Array.isArray(metadata)
      ? metadata[0]
      : (metadata[0] || metadata['0'] || Object.values(metadata)[0]);
    if (first) {
      return {
        fbId: String(first.fbid || first.image_id),
        previewUri: first.preview_uri || first.src || null,
      };
    }
  }

  // Alternative response format
  if (result?.payload?.fbid) {
    return {
      fbId: String(result.payload.fbid),
      previewUri: result.payload.preview_uri || null,
    };
  }

  log.error(MODULE, 'Unexpected upload response structure:', JSON.stringify(result).substring(0, 300));
  throw new Error('Could not extract fbId from upload response');
}
