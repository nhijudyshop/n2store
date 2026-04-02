// N2Store Extension configuration
export const CONFIG = {
  // Facebook endpoints
  FB_MESSAGING_SEND: 'https://business.facebook.com/messaging/send/',
  FB_UPLOAD: 'https://upload-business.facebook.com/ajax/mercury/upload.php',
  FB_BUSINESS_INBOX: 'https://business.facebook.com/latest/inbox/all',
  FB_GRAPHQL: 'https://business.facebook.com/api/graphql/',
  FB_COMMENT_ADD: 'https://www.facebook.com/ajax/ufi/add_comment.php',
  FB_COMMENT_EDIT: 'https://www.facebook.com/ajax/ufi/edit_comment.php',

  // Timeouts
  SEND_TIMEOUT: 30000,
  UPLOAD_TIMEOUT: 60000,
  GLOBAL_ID_TIMEOUT: 60000,
  SESSION_INIT_TIMEOUT: 30000,

  // Keep-alive
  WAKE_UP_INTERVAL: 10000,       // contentscript → service worker
  ALARM_INTERVAL_MIN: 0.5,       // chrome.alarms backup (minutes)

  // Cache TTL
  FB_DTSG_TTL: 3600000,          // 1 hour
  GLOBAL_ID_CACHE_TTL: 86400000, // 24 hours

  // Retry
  MAX_RETRIES: 2,
  RETRY_DELAY: 2000,

  // Extension
  EXTENSION_NAME: 'N2Store Messenger',

  // Server endpoints
  RENDER_SSE_URL: 'https://n2store-fallback.onrender.com',
  RENDER_API_URL: 'https://n2store-fallback.onrender.com',
  CF_WORKER_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev',

  // N2Store web app
  WEB_BASE_URL: 'https://nhijudyshop.workers.dev',
};
