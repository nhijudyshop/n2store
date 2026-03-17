// =====================================================
// N2STORE FACEBOOK WEBHOOK SERVER
// Nhận tin nhắn Facebook Page realtime qua Webhook
// Deploy trên Render.com
// =====================================================

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'n2store_webhook_token';
const APP_SECRET = process.env.APP_SECRET || '';

// =====================================================
// MIDDLEWARE
// =====================================================

// Parse JSON body - cần rawBody để verify signature
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// =====================================================
// DEDUPLICATION - tránh xử lý trùng message
// =====================================================

const processedMids = new Set();
const MAX_CACHE_SIZE = 5000;

function isDuplicate(mid) {
    if (!mid) return false;
    if (processedMids.has(mid)) return true;
    processedMids.add(mid);
    // Giữ cache không quá lớn
    if (processedMids.size > MAX_CACHE_SIZE) {
        const first = processedMids.values().next().value;
        processedMids.delete(first);
    }
    return false;
}

// =====================================================
// SIGNATURE VERIFICATION
// =====================================================

function verifySignature(req) {
    if (!APP_SECRET) return true; // Bỏ qua nếu chưa cấu hình

    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
        console.warn('[FB-WEBHOOK] ⚠️ Missing X-Hub-Signature-256 header');
        return false;
    }

    const expectedHash = crypto
        .createHmac('sha256', APP_SECRET)
        .update(req.rawBody || JSON.stringify(req.body))
        .digest('hex');

    const valid = signature === `sha256=${expectedHash}`;
    if (!valid) {
        console.warn('[FB-WEBHOOK] ⚠️ Invalid signature');
    }
    return valid;
}

// =====================================================
// EVENT HANDLERS
// =====================================================

function handleMessage(event, pageId) {
    const senderId = event.sender.id;
    const message = event.message;
    const timestamp = new Date(event.timestamp).toISOString();

    if (isDuplicate(message.mid)) {
        console.log(`[FB-WEBHOOK] ⏭️ Duplicate message skipped: ${message.mid}`);
        return;
    }

    // Text message
    if (message.text) {
        console.log(`[FB-WEBHOOK] 💬 TEXT`);
        console.log(`  Page: ${pageId}`);
        console.log(`  From: ${senderId}`);
        console.log(`  Text: ${message.text}`);
        console.log(`  MID:  ${message.mid}`);
        console.log(`  Time: ${timestamp}`);
    }

    // Quick reply
    if (message.quick_reply) {
        console.log(`[FB-WEBHOOK] ⚡ QUICK REPLY`);
        console.log(`  Payload: ${message.quick_reply.payload}`);
    }

    // Reply to specific message
    if (message.reply_to) {
        console.log(`[FB-WEBHOOK] ↩️ REPLY TO: ${message.reply_to.mid}`);
    }

    // Attachments (image, video, audio, file, sticker)
    if (message.attachments) {
        message.attachments.forEach((att, i) => {
            console.log(`[FB-WEBHOOK] 📎 ATTACHMENT ${i + 1}`);
            console.log(`  Type: ${att.type}`);
            if (att.payload?.url) {
                console.log(`  URL:  ${att.payload.url}`);
            }
            if (att.payload?.sticker_id) {
                console.log(`  Sticker ID: ${att.payload.sticker_id}`);
            }
        });
    }

    // Referral (from ads, shops)
    if (message.referral) {
        console.log(`[FB-WEBHOOK] 🔗 REFERRAL`);
        console.log(`  Ad ID: ${message.referral.ad_id || 'N/A'}`);
        console.log(`  Source: ${message.referral.source || 'N/A'}`);
    }

    console.log('');
}

function handlePostback(event, pageId) {
    const senderId = event.sender.id;
    const postback = event.postback;
    const timestamp = new Date(event.timestamp).toISOString();

    console.log(`[FB-WEBHOOK] 🔘 POSTBACK`);
    console.log(`  Page:    ${pageId}`);
    console.log(`  From:    ${senderId}`);
    console.log(`  Title:   ${postback.title}`);
    console.log(`  Payload: ${postback.payload}`);
    console.log(`  Time:    ${timestamp}`);

    if (postback.referral) {
        console.log(`  Referral: ${JSON.stringify(postback.referral)}`);
    }
    console.log('');
}

function handleDelivery(event, pageId) {
    const delivery = event.delivery;
    console.log(`[FB-WEBHOOK] ✅ DELIVERED`);
    console.log(`  Page: ${pageId}`);
    console.log(`  MIDs: ${delivery.mids?.join(', ') || 'N/A'}`);
    console.log(`  Watermark: ${new Date(delivery.watermark).toISOString()}`);
    console.log('');
}

function handleRead(event, pageId) {
    const read = event.read;
    console.log(`[FB-WEBHOOK] 👁️ READ`);
    console.log(`  Page: ${pageId}`);
    console.log(`  From: ${event.sender.id}`);
    console.log(`  Watermark: ${new Date(read.watermark).toISOString()}`);
    console.log('');
}

function handleEcho(event, pageId) {
    const message = event.message;

    if (isDuplicate(message.mid)) return;

    console.log(`[FB-WEBHOOK] 🔄 ECHO (Page sent message)`);
    console.log(`  Page: ${pageId}`);
    console.log(`  To:   ${event.recipient.id}`);
    console.log(`  MID:  ${message.mid}`);
    console.log(`  App:  ${message.app_id || 'Page Inbox'}`);
    if (message.text) console.log(`  Text: ${message.text}`);
    if (message.metadata) console.log(`  Meta: ${message.metadata}`);
    console.log('');
}

function handleReaction(event, pageId) {
    const reaction = event.reaction;
    console.log(`[FB-WEBHOOK] ${reaction.action === 'react' ? '😀' : '😶'} REACTION`);
    console.log(`  Page:     ${pageId}`);
    console.log(`  From:     ${event.sender.id}`);
    console.log(`  Action:   ${reaction.action}`);
    console.log(`  Reaction: ${reaction.reaction}`);
    console.log(`  Emoji:    ${reaction.emoji || 'N/A'}`);
    console.log(`  On MID:   ${reaction.mid}`);
    console.log('');
}

// =====================================================
// ROUTES
// =====================================================

// Health check
app.get('/ping', (req, res) => {
    res.json({
        success: true,
        service: 'n2store-fb-webhook',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// GET /webhook - Facebook Verification
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('[FB-WEBHOOK] ✅ Webhook verified successfully!');
        return res.status(200).send(challenge);
    }

    console.warn(`[FB-WEBHOOK] ❌ Verification failed - mode: ${mode}, token: ${token}`);
    res.sendStatus(403);
});

// POST /webhook - Nhận events từ Facebook
app.post('/webhook', (req, res) => {
    // Response 200 ngay lập tức (Facebook yêu cầu < 5 giây)
    res.status(200).send('EVENT_RECEIVED');

    // Verify signature
    if (!verifySignature(req)) {
        console.error('[FB-WEBHOOK] ❌ Signature verification failed, ignoring event');
        return;
    }

    const body = req.body;

    if (body.object !== 'page') {
        console.warn(`[FB-WEBHOOK] ⚠️ Unknown object type: ${body.object}`);
        return;
    }

    console.log('[FB-WEBHOOK] ========================================');
    console.log(`[FB-WEBHOOK] 📥 Received webhook at ${new Date().toISOString()}`);

    body.entry.forEach(entry => {
        const pageId = entry.id;

        // Messaging events (messages, postbacks, deliveries, reads)
        if (entry.messaging) {
            entry.messaging.forEach(event => {
                if (event.message?.is_echo) {
                    handleEcho(event, pageId);
                } else if (event.message) {
                    handleMessage(event, pageId);
                } else if (event.postback) {
                    handlePostback(event, pageId);
                } else if (event.delivery) {
                    handleDelivery(event, pageId);
                } else if (event.read) {
                    handleRead(event, pageId);
                } else if (event.reaction) {
                    handleReaction(event, pageId);
                } else {
                    console.log(`[FB-WEBHOOK] ❓ Unknown event type:`);
                    console.log(JSON.stringify(event, null, 2));
                }
            });
        }
    });

    console.log('[FB-WEBHOOK] ========================================');
});

// Root - info page
app.get('/', (req, res) => {
    res.json({
        service: 'N2Store Facebook Webhook Server',
        status: 'running',
        endpoints: {
            'GET /ping': 'Health check',
            'GET /webhook': 'Facebook verification',
            'POST /webhook': 'Receive Facebook events'
        }
    });
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log('');
    console.log('=====================================================');
    console.log(' N2STORE FACEBOOK WEBHOOK SERVER');
    console.log('=====================================================');
    console.log(`  Port:         ${PORT}`);
    console.log(`  Verify Token: ${VERIFY_TOKEN}`);
    console.log(`  App Secret:   ${APP_SECRET ? '***configured***' : '⚠️ NOT SET'}`);
    console.log(`  Webhook URL:  http://localhost:${PORT}/webhook`);
    console.log('=====================================================');
    console.log('');
});
