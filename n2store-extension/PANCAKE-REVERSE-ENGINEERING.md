# Pancake Extension v0.5.43 - Reverse Engineering

> Phân tích source code Pancake Extension để xây dựng N2Store Extension tương thích 100%.
> Extension ID: `oehooocookcnclgniepdgaiankfifmmn`
> Path: `~/Library/Application Support/Google/Chrome/Profile 34/Extensions/oehooocookcnclgniepdgaiankfifmmn/0.5.43_0/`

---

## 1. Cấu trúc file

```
scripts/
├── background.js      # 596KB minified - Service Worker chính
├── contentscript.js   # Bridge: page ↔ service worker
├── cext.js            # Content extension helper
├── offscreen.js       # Offscreen document logic
└── worker.js          # Web Worker helper
```

---

## 2. Luồng gửi tin nhắn (REPLY_INBOX_PHOTO)

### 2.1. Inbox page gửi message qua `window.postMessage`

```javascript
// inbox-chat.js → _sendViaExtension()
window.postMessage({
    type: 'REPLY_INBOX_PHOTO',
    pageId: conv.pageId,                    // Facebook Page ID
    message: msgText,                        // Nội dung tin nhắn
    attachmentType: 'SEND_TEXT_ONLY',        // hoặc 'PHOTO'
    files: msgFiles,                         // Array fbId từ upload
    globalUserId: globalUserId,              // FB global user ID (từ GET_GLOBAL_ID_FOR_CONV)
    platform: 'facebook',
    replyMessage: null,
    threadId: psid,                          // PSID (page-scoped user ID)
    convId: 't_' + psid,
    customerName: conv.customerName || '',
    conversationUpdatedTime: timestamp,
    photoUrls: [],
    isBusiness: false,
    taskId: sendTaskId,                      // Unique ID để match response
    accessToken: accessToken,
    tryResizeImage: true,
    contentIds: [],
    from: 'WEBPAGE'
}, '*');
```

### 2.2. Content Script relay → Service Worker

```
contentscript.js: window.addEventListener('message')
    → chrome.runtime.sendMessage(msg)
    → background.js handles
```

### 2.3. Service Worker xử lý

**Luồng chính:**
1. `buildSendParams(data)` → tạo form params
2. `buildParams()` → thêm base params (fb_dtsg, __user, etc.)
3. `fetch('https://business.facebook.com/messaging/send/', ...)` → POST
4. `parseFbRes(response)` → parse `for(;;);{json}`
5. Check `isResponseSuccess(result)` → success/error

---

## 3. Request thực tế (Network capture)

### 3.1. URL

```
POST https://business.facebook.com/messaging/send/
```

### 3.2. Headers

```http
Content-Type: application/x-www-form-urlencoded
X-MSGR-Region: HIL
```

> Pancake chỉ gửi 2 header chính. Browser tự thêm sec-fetch-*, accept, cookie.
> `X-MSGR-Region` lấy từ `MercuryServerRequestsConfig.msgrRegion` trong HTML.

### 3.3. Request Body (URL-encoded)

Từ network capture thực tế:

```
body=54312
offline_threading_id=7445379291487933320
source=source:page_unified_inbox
timestamp=1775116751548
request_user_id=270136663390370              ← Page ID

__user=100091492933314                        ← Admin User ID (= c_user cookie)
__a=1
__req=1g
__csr=                                        ← Empty string
__beoa=0
__pc=BP:bizweb_pkg                           ← pkg_cohort từ SiteData
dpr=2                                         ← Device pixel ratio
__ccg=EXCELLENT
__rev=1036512893                              ← client_revision
__hsi=7624068381287034275
__hs=20545.BP:bizweb_pkg.2.0...0             ← haste_session
__comet_req=0
__spin_r=1036512893
__spin_b=trunk
__spin_t=1775116748
__s=3pyq6w:mpjeak:4r63y7                    ← Web session ID (3 random segments)

fb_dtsg=NAfvSMN4glMq0Y9pRdjIbldBGNdLjMLduThDr-LYooOPo46fLoNZtYw:38:1775116648
jazoest=25602
lsd=X3seAScPqGyQsnNLcYGx1b
__usid=null

specific_to_list[0]=fbid:100069170327874     ← Global User ID
specific_to_list[1]=fbid:270136663390370     ← Page ID
other_user_fbid=100069170327874              ← Global User ID
message_id=7445379291487933320               ← = offline_threading_id
client=mercury
action_type=ma-type:user-generated-message
ephemeral_ttl_mode=0
has_attachment=undefined                      ← "undefined" nếu không có files
```

### 3.4. Response format

**Thành công:**
```
for (;;);{"__ar":1,"payload":{"actions":[{"message_id":"mid.$xxx","timestamp":1775116752}]}}
```

**Lỗi (numeric code):**
```
for (;;);{"__ar":0,"error":1545002,"errorSummary":"Sorry, something went wrong.","errorDescription":"..."}
```

---

## 4. Phân tích chi tiết từng parameter

### 4.1. Base Params (`buildParams()`)

```javascript
// Pancake code (deobfuscated):
buildParams(ctx = this.ctx) {
    const params = {
        __user: ctx.userID,                    // Admin's Facebook User ID
        __a: 1,
        __req: (this.request_count++).toString(36)  // Auto-increment base36
    };

    if (this.SiteData) {
        params.__csr = "";
        params.__beoa = this.SiteData.be_one_ahead ? 1 : 0;
        params.__pc = this.SiteData.pkg_cohort;    // "BP:bizweb_pkg"
        params.dpr = this.SiteData.pr;              // Device pixel ratio
        params.__ccg = this.WebConnectionClassServerGuess.connectionClass;  // "EXCELLENT"
        params.__rev = this.SiteData.client_revision;
        params.__hsi = this.SiteData.hsi;
        params.__hs = this.SiteData.haste_session;
        params.__comet_req = this.SiteData.is_comet ? 1 : 0;

        // Spin params
        if (this.SiteData.spin) {
            params.__spin_r = this.SiteData.__spin_r;
            params.__spin_b = this.SiteData.__spin_b;
            params.__spin_t = this.SiteData.__spin_t;
        }

        params.__s = this.webSession.getId();       // Random session ID
    }

    if (!params.__rev) params.__rev = ctx.client_revision;

    // DTSG + Jazoest
    if (ctx.dtsg) {
        params.fb_dtsg = ctx.dtsg;
        params.jazoest = this.calcJazoest(ctx.dtsg);  // "2" + sum of charCodes
    }

    params.lsd = ctx.lsd;

    return params;
}
```

### 4.2. Send Params (`buildSendParams()`)

```javascript
// Pancake code (deobfuscated):
async buildSendParams({ pageId, globalUserId, files, text, platform, attachmentType, replyMessage }) {
    const params = {};
    const offlineThreadingId = this.generateOfflineThreadingID();

    params.body = text || "";
    params.offline_threading_id = offlineThreadingId;
    params.source = "source:page_unified_inbox";
    params.timestamp = new Date().getTime();
    params.request_user_id = pageId;

    // Merge base params
    Object.assign(params, this.base.buildParams(), { __usid: this.base.generateUsid() });
    // NOTE: generateUsid() returns null → __usid=null

    if (platform === "facebook") {
        // Reply message handling
        if (replyMessage) {
            const loaded = await this.findInternalMessage(data, replyMessage);
            params.replied_to_message_id = loaded.message_id;
        }

        params["specific_to_list[0]"] = "fbid:" + globalUserId;
        params["specific_to_list[1]"] = "fbid:" + pageId;
        params.other_user_fbid = globalUserId;
        params.message_id = offlineThreadingId;
        params.client = "mercury";
        params.action_type = "ma-type:user-generated-message";
        params.ephemeral_ttl_mode = 0;
        params.has_attachment = files && files.length > 0;

        // Attachments
        if (files && files.length > 0) {
            if (attachmentType === "STICKER") {
                params.sticker_id = files[0];
            } else if (attachmentType === "VIDEO") {
                files.forEach((id, i) => { params["video_ids[" + i + "]"] = id; });
            } else if (attachmentType === "FILE") {
                files.forEach((id, i) => { params["file_ids[" + i + "]"] = id; });
            } else if (attachmentType === "AUDIO") {
                files.forEach((id, i) => { params["audio_ids[" + i + "]"] = id; });
            } else {
                // Default: PHOTO
                files.forEach((id, i) => { params["image_ids[" + i + "]"] = id; });
            }
        }
    }

    return params;
}
```

### 4.3. Jazoest Calculation

```javascript
// Pancake's calcJazoest:
calcJazoest(dtsg) {
    let sum = 0;
    for (let i = 0; i < dtsg.length; i++) {
        sum += dtsg.charCodeAt(i);
    }
    return "2" + sum;  // e.g., "25602"
}

// V2 variant (used if sprinkle_config.version === 2):
calcJazoestV2(dtsg) {
    let sum = 0;
    for (let i = 0; i < dtsg.length; i++) {
        sum += dtsg.charCodeAt(i);
    }
    sum = sum.toString();
    return this.sprinkle_config.should_randomize ? sum : "2" + sum;
}
```

### 4.4. Offline Threading ID

```javascript
// Pancake's generateOfflineThreadingID:
// Converts timestamp from decimal to binary, then appends 22 random bits
generateOfflineThreadingID() {
    const now = Date.now();
    const binary = decToBin(now.toString());  // Convert to binary string
    const random22 = Math.floor(Math.random() * 4194303).toString(2); // 22-bit random
    const padded = "0".repeat(22 - random22.length) + random22;
    return binToDec(binary + padded);  // Convert back to decimal string
}
// Equivalent to: (BigInt(now) << 22n | BigInt(random)).toString()
```

### 4.5. Headers (`buildHeaders()`)

```javascript
// Pancake's buildHeaders:
buildHeaders() {
    if (this.MercuryServerRequestsConfig) {
        return { "X-MSGR-Region": this.MercuryServerRequestsConfig.msgrRegion };
    }
    return {};
}
// Content-Type header is added separately at the fetch call level
```

### 4.6. Response Parsing

```javascript
// Pancake's parseFbRes:
makeParsable(text) {
    return text.replace(/for\s*\(\s*;\s*;\s*\)\s*;\s*/, "");
}

parseFbRes(text) {
    return JSON.parse(this.makeParsable(text));
}

// Success check:
isResponseSuccess(response, platform) {
    if (platform === "facebook") {
        return response
            && response.payload
            && (response.payload.actions && response.payload.actions[0].message_id
                || response.payload.error_payload);
    }
}
```

---

## 5. Error Handling

### 5.1. Error Codes (numeric)

Pancake checks `response.error` as a **number**:

```javascript
const KNOWN_ERRORS = [1357004, 1545012, 1545006, 3252001, 1390008];

getErrorHandler(pageId, response, retryCount) {
    // Socket retry on specific code
    if (response.error === 1545012 && retryCount === 1) {
        return "retryUsingSocket";
    }

    // No response → restart inbox
    if (!response) {
        return "restartInbox";
    }

    // Instagram error_payload
    if (response.payload?.error_payload === true
        && ["instagram_official", "instagram"].includes(this.platform)
        && !response.error) {
        return "retryUsingSocket";
    }

    // Unknown error → cannot retry
    if (!KNOWN_ERRORS.includes(response.error)) {
        return "cannotRetry";
    }

    // Upload blocked
    if (this.checkCanReuploadPhotos(response) || response.error === 1545006) {
        if (!await this.isUploadBlocked(pageId)) {
            return "reuploadPhotos";
        }
        return "reuploadPhotosByApi";
    }

    // Rate limited / temporary → retry via socket
    if (response.error === 3252001 || response.error === 1390008) {
        return "retryUsingSocket";
    }

    // Default: restart inbox
    return "restartInbox";
}
```

### 5.2. Error Code Mapping

| Code | Ý nghĩa | Retry Strategy |
|------|---------|---------------|
| `1357004` | Unknown | `restartInbox` |
| `1545012` | Blocked (1st retry) | `retryUsingSocket` |
| `1545006` | Upload blocked | `reuploadPhotos` / `reuploadPhotosByApi` |
| `3252001` | Rate limited | `retryUsingSocket` |
| `1390008` | Temporary error | `retryUsingSocket` |
| `1545041` | User unavailable | `cannotRetry` (special: skip reload) |
| Others | Unknown | `cannotRetry` |

### 5.3. Fallback: Regex extraction từ HTML error

```javascript
// Nếu parseFbRes() fail (response là HTML thay vì JSON),
// Pancake cố tìm message_id trong raw HTML:
const match = rawHtml.match(/MTouchChannelPayloadRouter.+\\"mid\\":\\"([^\\"]+)\\"/i);
if (match) {
    const messageId = match[1].replace("mid", "m_mid");
    // Coi như thành công!
    return { type: "REPLY_INBOX_PHOTO_SUCCESS", messageId };
}
```

---

## 6. Session Initialization (fb_dtsg extraction)

### 6.1. Fetch Business Suite HTML

```
GET https://business.facebook.com/latest/inbox/all?page_id={pageId}
credentials: include
```

### 6.2. Extract từ HTML

```javascript
// fb_dtsg (CSRF token) - Primary
/"DTSGInitialData",\[\],\{"token":"([^"]+)"/

// LSD
/"LSD",\[\],\{"token":"([^"]+)"/

// USER_ID (admin's Facebook ID)
/"USER_ID":"(\d+)"/

// client_revision
/"client_revision":(\d+)/

// haste_session
/"haste_session":"([^"]+)"/

// hsi
/"hsi":"([^"]+)"/

// Spin params
/"__spin_r":(\d+)/
/"__spin_b":"([^"]+)"/
/"__spin_t":(\d+)/

// pkg_cohort
/"pkg_cohort":"([^"]+)"/

// Device pixel ratio
/"pr":(\d+(?:\.\d+)?)/

// MSGR Region (for X-MSGR-Region header)
/"msgrRegion":"([^"]+)"/

// jazoest (hoặc tính từ fb_dtsg)
/jazoest=(\d+)/
```

---

## 7. DeclarativeNetRequest Rules

Pancake dùng `declarativeNetRequest` để modify Origin/Referer headers:

```javascript
// Dynamic rules cho messaging
chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [100, 101],
    addRules: [{
        id: 100,
        priority: 2,
        action: {
            type: 'modifyHeaders',
            requestHeaders: [
                { header: 'Origin', operation: 'set', value: 'https://business.facebook.com' },
                { header: 'Referer', operation: 'set', value: 'https://business.facebook.com/latest/inbox/all?page_id={pageId}' }
            ]
        },
        condition: {
            urlFilter: '||business.facebook.com/messaging/send/',
            resourceTypes: ['xmlhttprequest']
        }
    }, {
        id: 101,
        priority: 2,
        action: {
            type: 'modifyHeaders',
            requestHeaders: [
                { header: 'Origin', operation: 'set', value: 'https://business.facebook.com' },
                { header: 'Referer', operation: 'set', value: 'https://business.facebook.com/latest/inbox/all?page_id={pageId}' }
            ]
        },
        condition: {
            urlFilter: '||upload-business.facebook.com/',
            resourceTypes: ['xmlhttprequest']
        }
    }]
});
```

---

## 8. Quan trọng: Khác biệt giữa Pancake và N2Store (đã fix)

### Đã fix:

| Parameter | Pancake | N2Store (cũ) | N2Store (mới) |
|-----------|---------|-------------|---------------|
| `source` | `source:page_unified_inbox` | `source:titan:web` | `source:page_unified_inbox` |
| `client` | `mercury` | _(missing)_ | `mercury` |
| `action_type` | `ma-type:user-generated-message` | _(missing)_ | `ma-type:user-generated-message` |
| `__user` | Admin User ID | Page ID | Admin User ID |
| `tags[0]` | _(not sent)_ | `page_messaging` | _(removed)_ |
| `ui_push_phase` | _(not sent)_ | `V3` | _(removed)_ |
| `__s` | `random:random:random` | `""` (empty) | Random generated |
| `__csr` | `""` (empty) | _(missing)_ | `""` |
| `__pc` | `BP:bizweb_pkg` | _(missing)_ | Extracted from HTML |
| `__usid` | `null` | _(missing)_ | `null` |
| `dpr` | `2` (from HTML) | `1` (hardcoded) | From HTML |
| `X-MSGR-Region` | `HIL` | _(missing)_ | From HTML |

### Cần theo dõi:

- `jazoest`: Pancake tính từ fb_dtsg (`"2" + sum(charCodes)`). N2Store extract từ HTML. Nên tính giống Pancake nếu HTML extraction fail.
- `__s`: Pancake dùng `webSession.getId()` (persistent per session). N2Store generate random mỗi request. Có thể Facebook kiểm tra session ID consistency.

---

## 9. Upload ảnh (UPLOAD_INBOX_PHOTO)

### 9.1. Request

```
POST https://upload-business.facebook.com/ajax/mercury/upload.php
Content-Type: multipart/form-data
```

### 9.2. FormData

```
fb_dtsg={token}
__user={adminUserId}
__a=1
__req={base36}
... (same base params)

upload_{random8chars}=<blob>   ← File blob
farr=upload_{random8chars}     ← Field name reference
upload_id=upload_{timestamp}
```

### 9.3. Response

```json
{
    "payload": {
        "metadata": [{
            "fbid": "12345678",
            "preview_uri": "https://..."
        }]
    }
}
```

---

## 10. Global ID Resolution (GET_GLOBAL_ID_FOR_CONV)

### 10.1. Pancake Extension's Fe class — 5 strategies

Reverse-engineered from `background.js` class `Fe`:

**Strategy 1: PagesManagerInboxAdminAssignerRootQuery** (needs threadId)
```
POST /api/graphql/
variables={"pageID":"{pageId}","commItemID":"{threadId}"}
→ data.commItem.target_id = globalId
```

**Strategy 2: PagesManagerInboxQueryUtilCommItemHeaderMercuryQuery** (needs threadKey + cquick_token)
```
POST /api/graphql/
variables={"pageID":"{pageId}","messageThreadID":"t_{threadId}"}
extra: cquick, cquick_token, ctarget, av
→ data.page.page_comm_item_for_message_thread.target_id = globalId
```

**Strategy 3: findThread — MessengerGraphQLThreadlistFetcher** (needs customerName OR threadId)
```
POST /api/graphql/  (batch)
variables={"limit":20,"tags":["INBOX"],"before":{timeCursor}}
→ Loads 20 threads at a time, matches by:
  - page_comm_item.id === threadId
  - page_comm_item.comm_source_id === threadId
  - participant name === customerName
→ found.thread_key.other_user_id = globalId
Paginates up to 200 threads. Tries categories: main → done → page_background → spam
```

**Strategy 4: getUserInboxByName — PagesManagerInboxCustomerSearchQuery** (needs customerName)
```
POST /api/graphql/
variables={"pageID":"{pageId}","channel":"MESSENGER","count":5,"searchTerm":"{customerName}"}
→ data.page.page_unified_customer_search.edges[].node
  .unified_contact_comms_facebook.edges[].node.target_id = globalId
```

**Strategy 5: globalIdFromThread** — simple extraction after findThread
```javascript
// Just returns thread_key.other_user_id from the found thread node
```

### 10.2. Response paths (multiple)

```
// Strategy 1
data.commItem.target_id

// Strategy 2
data.page.page_comm_item_for_message_thread.target_id

// Strategy 3 (findThread)
node.thread_key.other_user_id
node.all_participants.edges[].node.messaging_actor.id (non-page)

// Strategy 4 (search by name)
data.page.page_unified_customer_search.edges[].node
    .unified_contact_comms_facebook.edges[].node.target_id

// Generic deep search
data.node.messaging_actor.id
data.message_thread.all_participants.nodes[].messaging_actor.id
obj.other_user_fbid
```

### 10.3. Fallback chain (inbox-chat.js → extension)

1. Cache: `_globalIdCache[convId]`
2. Pancake API data: `conv._raw.page_customer?.global_id`
3. Messages data: `conv._messagesData?.customers?.[0]?.global_id`
4. Extension: `GET_GLOBAL_ID_FOR_CONV` (5 strategies above, needs threadId OR customerName)

---

## 11. Key Constants

```javascript
// Facebook API endpoints
MESSAGING_SEND = "https://business.facebook.com/messaging/send/"
UPLOAD = "https://upload-business.facebook.com/ajax/mercury/upload.php"
GRAPHQL = "https://business.facebook.com/api/graphql/"
BUSINESS_INBOX = "https://business.facebook.com/latest/inbox/all"

// Error codes
KNOWN_ERRORS = [1357004, 1545012, 1545006, 3252001, 1390008]
USER_UNAVAILABLE = 1545041

// Attachment types
TYPES = ['SEND_TEXT_ONLY', 'PHOTO', 'VIDEO', 'FILE', 'STICKER', 'AUDIO']
```
