// Facebook utility functions

/**
 * Parse Facebook response format: for (;;);{json}
 * Also handles other FB response formats
 */
export function parseFbRes(text) {
  if (!text || text.length === 0) {
    throw new Error('Empty response from Facebook');
  }

  // Try standard format: for (;;);{json}
  if (text.startsWith('for (;;);')) {
    const cleaned = text.substring(9); // "for (;;);".length === 9
    return JSON.parse(cleaned);
  }

  // Try direct JSON
  if (text.startsWith('{') || text.startsWith('[')) {
    return JSON.parse(text);
  }

  // Try other FB prefixes
  const prefixes = ['for(;;);', 'while(1);', 'for (;;); '];
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) {
      return JSON.parse(text.substring(prefix.length));
    }
  }

  // If HTML, extract useful info
  if (text.includes('<!DOCTYPE') || text.includes('<html')) {
    const titleMatch = text.match(/<title>([^<]*)<\/title>/i);
    throw new Error(`Facebook returned HTML page: "${titleMatch?.[1] || 'unknown'}". Possibly redirected to login or error page.`);
  }

  throw new Error(`Unexpected response format. Starts with: "${text.substring(0, 80)}"`);
}

/**
 * Generate Facebook offline_threading_id
 * Format: high bits of timestamp << 22 | random 22-bit value
 */
export function generateOfflineThreadingID() {
  const now = Date.now();
  const random = Math.floor(Math.random() * 4194303); // 22 bits max
  return (BigInt(now) << 22n | BigInt(random)).toString();
}

/**
 * Generate unique request ID for __req parameter
 */
let reqCounter = 0;
export function generateReqId() {
  reqCounter++;
  return reqCounter.toString(36);
}

/**
 * Build standard Facebook headers
 */
export function buildFbHeaders(referer) {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'X-ASBD-ID': '129477',
    'X-FB-LSD': '',
    ...(referer ? { 'Referer': referer } : {}),
  };
}

/**
 * Build base Facebook form params
 * Only includes params that have actual values (Facebook 500s on empty required params)
 */
export function buildBaseParams(dtsgData) {
  const params = {
    fb_dtsg: dtsgData.token,
    __user: dtsgData.userId || '0',
    __a: '1',
    __req: generateReqId(),
    __beoa: '0',
    dpr: '1',
    __ccg: 'EXCELLENT',
    __comet_req: '0',
    __s: '',
  };

  // Only add optional params if they have values
  if (dtsgData.jazoest) params.jazoest = dtsgData.jazoest;
  if (dtsgData.lsd) params.lsd = dtsgData.lsd;
  if (dtsgData.hs) params.__hs = dtsgData.hs;
  if (dtsgData.rev) params.__rev = dtsgData.rev;
  if (dtsgData.hsi) params.__hsi = dtsgData.hsi;
  if (dtsgData.spinR) params.__spin_r = dtsgData.spinR;
  if (dtsgData.spinB) params.__spin_b = dtsgData.spinB;
  if (dtsgData.spinT) params.__spin_t = dtsgData.spinT;

  return params;
}

/**
 * URL-encode an object for form POST
 */
export function encodeFormData(obj) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }
  return params.toString();
}

/**
 * Generate a random upload field name
 */
export function generateUploadFieldName() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let name = 'upload_';
  for (let i = 0; i < 8; i++) {
    name += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return name;
}
