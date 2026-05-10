// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// GROQ VISION SERVICE — free tier 14,400 req/day vision describe
// thay cho Gemini Vision describe ($0.001/call → ~$0).
//
// Endpoint: https://api.groq.com/openai/v1/chat/completions (OpenAI-compatible)
// Model: meta-llama/llama-4-scout-17b-16e-instruct (vision-capable)
// Auth: Bearer GROQ_API_KEY (free signup tại console.groq.com)
// =====================================================

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const BASE = 'https://api.groq.com/openai/v1';

function isAvailable() {
    return !!GROQ_API_KEY;
}

/**
 * Describe an image as a generation prompt — replaces Gemini Vision describe.
 *
 * @param {object} args
 * @param {Buffer} args.buffer - image bytes
 * @param {string} args.mimeType - image/jpeg | image/png | image/webp
 * @returns {Promise<{prompt: string, model: string}>}
 */
async function describeFromImage({ buffer, mimeType }) {
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured');
    const b64 = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${b64}`;
    const body = {
        model: GROQ_MODEL,
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: 'You are a photography prompt writer. Describe this image as a detailed prompt suitable for re-generating a similar portrait. Focus on: subject (gender, age, ethnicity), pose, outfit, lighting, background, mood, camera angle. Output 80-150 words plain text — no preamble, no markdown.',
                    },
                    { type: 'image_url', image_url: { url: dataUrl } },
                ],
            },
        ],
        max_tokens: 350,
        temperature: 0.4,
    };
    const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(`Groq vision: ${data?.error?.message || `HTTP ${res.status}`}`);
    }
    const prompt = data.choices?.[0]?.message?.content?.trim() || '';
    if (!prompt) throw new Error('Groq vision: empty response');
    return { prompt, model: GROQ_MODEL };
}

module.exports = { isAvailable, describeFromImage, GROQ_MODEL };
