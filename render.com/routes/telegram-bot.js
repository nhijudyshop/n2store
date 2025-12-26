// =====================================================
// TELEGRAM BOT WITH GEMINI AI INTEGRATION
// Webhook endpoint for Telegram bot powered by Gemini 2.0 Flash
// =====================================================

const express = require('express');
const router = express.Router();

// API Keys from environment variables (set on Render)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3-flash-preview';

// Store conversation history per user (in-memory, resets on server restart)
const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 20; // Keep last 20 messages per user

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Send message to Telegram user
 */
async function sendTelegramMessage(chatId, text, parseMode = 'Markdown') {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: parseMode
            })
        });

        const data = await response.json();
        if (!data.ok) {
            // Retry without parse mode if Markdown fails
            if (parseMode === 'Markdown') {
                return sendTelegramMessage(chatId, text, null);
            }
            console.error('[TELEGRAM] Send error:', data.description);
        }
        return data;
    } catch (error) {
        console.error('[TELEGRAM] Send error:', error.message);
        return null;
    }
}

/**
 * Send "typing" action to show bot is processing
 */
async function sendTypingAction(chatId) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`;

    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                action: 'typing'
            })
        });
    } catch (error) {
        // Ignore typing action errors
    }
}

/**
 * Call Gemini API with conversation history
 */
async function callGeminiAI(userId, userMessage) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    // Get or create conversation history for this user
    if (!conversationHistory.has(userId)) {
        conversationHistory.set(userId, []);
    }
    const history = conversationHistory.get(userId);

    // Add user message to history
    history.push({
        role: 'user',
        parts: [{ text: userMessage }]
    });

    // Trim history if too long
    while (history.length > MAX_HISTORY_LENGTH) {
        history.shift();
    }

    // Build API request with full conversation history
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: history,
            generationConfig: {
                temperature: 0.7,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 2048
            }
        })
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message);
    }

    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
        throw new Error('Empty response from Gemini');
    }

    // Add AI response to history
    history.push({
        role: 'model',
        parts: [{ text: aiResponse }]
    });

    return aiResponse;
}

/**
 * Clear conversation history for a user
 */
function clearHistory(userId) {
    conversationHistory.delete(userId);
}

// =====================================================
// ROUTES
// =====================================================

// Health check
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Telegram Bot with Gemini AI',
        model: GEMINI_MODEL,
        hasBotToken: !!TELEGRAM_BOT_TOKEN,
        hasGeminiKey: !!GEMINI_API_KEY,
        activeConversations: conversationHistory.size
    });
});

// Telegram Webhook endpoint
// POST /api/telegram/webhook
router.post('/webhook', async (req, res) => {
    try {
        // Respond immediately to Telegram
        res.sendStatus(200);

        const update = req.body;

        // Handle message updates
        if (update.message) {
            const message = update.message;
            const chatId = message.chat.id;
            const userId = message.from.id;
            const text = message.text;
            const firstName = message.from.first_name || 'User';

            console.log(`[TELEGRAM] Message from ${firstName} (${userId}): ${text?.substring(0, 50)}...`);

            // Handle commands
            if (text === '/start') {
                clearHistory(userId);
                await sendTelegramMessage(chatId,
                    `Xin chao ${firstName}! 👋\n\n` +
                    `Toi la Gemini AI Assistant.\n` +
                    `Ban co the hoi toi bat ky dieu gi!\n\n` +
                    `*Cac lenh:*\n` +
                    `/start - Bat dau cuoc tro chuyen moi\n` +
                    `/clear - Xoa lich su tro chuyen\n` +
                    `/help - Huong dan su dung`
                );
                return;
            }

            if (text === '/clear') {
                clearHistory(userId);
                await sendTelegramMessage(chatId, 'Da xoa lich su tro chuyen. Ban co the bat dau cuoc tro chuyen moi!');
                return;
            }

            if (text === '/help') {
                await sendTelegramMessage(chatId,
                    `*Huong dan su dung Gemini AI Bot:*\n\n` +
                    `1. Gui tin nhan bat ky de tro chuyen voi AI\n` +
                    `2. Bot se nho lich su tro chuyen cua ban\n` +
                    `3. Dung /clear de xoa lich su va bat dau lai\n\n` +
                    `*Model:* ${GEMINI_MODEL}\n` +
                    `*Powered by:* Google Gemini AI`
                );
                return;
            }

            // Ignore non-text messages
            if (!text) {
                await sendTelegramMessage(chatId, 'Xin loi, toi chi ho tro tin nhan van ban.');
                return;
            }

            // Check if API keys are configured
            if (!TELEGRAM_BOT_TOKEN || !GEMINI_API_KEY) {
                await sendTelegramMessage(chatId, 'Bot chua duoc cau hinh day du. Vui long lien he admin.');
                return;
            }

            // Show typing indicator
            await sendTypingAction(chatId);

            try {
                // Call Gemini AI
                const aiResponse = await callGeminiAI(userId, text);

                // Send response (split if too long)
                if (aiResponse.length > 4000) {
                    // Split into chunks
                    const chunks = aiResponse.match(/[\s\S]{1,4000}/g) || [];
                    for (const chunk of chunks) {
                        await sendTelegramMessage(chatId, chunk);
                    }
                } else {
                    await sendTelegramMessage(chatId, aiResponse);
                }

            } catch (error) {
                console.error('[TELEGRAM] Gemini error:', error.message);
                await sendTelegramMessage(chatId,
                    `Co loi xay ra khi xu ly tin nhan:\n${error.message}\n\nVui long thu lai sau.`,
                    null
                );
            }
        }

    } catch (error) {
        console.error('[TELEGRAM] Webhook error:', error.message);
        // Already sent 200, just log the error
    }
});

// Manual send endpoint (for testing)
// POST /api/telegram/send
router.post('/send', async (req, res) => {
    try {
        const { chatId, text } = req.body;

        if (!chatId || !text) {
            return res.status(400).json({ error: 'Missing chatId or text' });
        }

        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const result = await sendTelegramMessage(chatId, text);
        res.json(result);

    } catch (error) {
        console.error('[TELEGRAM] Send error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Set webhook URL
// POST /api/telegram/setWebhook
router.post('/setWebhook', async (req, res) => {
    try {
        const { webhookUrl } = req.body;

        if (!webhookUrl) {
            return res.status(400).json({ error: 'Missing webhookUrl' });
        }

        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: webhookUrl,
                allowed_updates: ['message']
            })
        });

        const data = await response.json();
        console.log('[TELEGRAM] Webhook set:', data);
        res.json(data);

    } catch (error) {
        console.error('[TELEGRAM] setWebhook error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get webhook info
// GET /api/telegram/webhookInfo
router.get('/webhookInfo', async (req, res) => {
    try {
        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`;
        const response = await fetch(url);
        const data = await response.json();

        res.json(data);

    } catch (error) {
        console.error('[TELEGRAM] webhookInfo error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Delete webhook (switch to polling mode)
// POST /api/telegram/deleteWebhook
router.post('/deleteWebhook', async (req, res) => {
    try {
        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`;
        const response = await fetch(url);
        const data = await response.json();

        console.log('[TELEGRAM] Webhook deleted:', data);
        res.json(data);

    } catch (error) {
        console.error('[TELEGRAM] deleteWebhook error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
