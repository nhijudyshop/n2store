// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// GEMINI VISION → PORTRAIT PROMPT — describe an uploaded image as a
// generation-ready prompt. Used in Models page: user upload reference photo
// → button "📷 Tạo prompt từ ảnh" → Gemini reads image + writes prompt text
// → fills textarea cho user edit + Section 2 Tạo bằng AI flow.
//
// Cost: text gen on Gemini 2.5 Flash, ~1290 input tokens (image) + ~150
// output tokens ≈ $0.001/call. Free tier on backend (no charge to user).
// =====================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DESCRIBE_MODEL = process.env.AIKOL_GEMINI_DESCRIBE_MODEL || 'gemini-2.5-flash';

const SYSTEM_INSTRUCTION = `You are a portrait-prompt writer for an AI image generator.
Look at the uploaded photo and write a single concise English prompt (60-150 words)
that describes the person so an AI can re-create someone with the same look.

Include:
- Gender, approximate age, ethnicity hints (e.g., "young Vietnamese woman, age 25")
- Hair (color, length, style), facial features (only what is visible — don't invent)
- Visible outfit (top, accessories, jewelry, glasses if any)
- Expression / mood
- Lighting (studio softbox / golden hour / overcast / etc.)
- Background / setting
- Photo style: photorealistic, sharp focus, ultra detailed

Rules:
- Output ONLY the prompt text. No preamble, no quotes, no markdown.
- Do NOT say "this image shows" or "in the photo"; write as a direct generation prompt.
- Do NOT describe people not in the image.
- Do NOT include identifiable PII like full name unless explicitly visible (e.g., on a name tag).
- If face is partially obscured, write what is visible.

Example output:
"A Vietnamese woman, age 24, with long flowing black hair and a gentle smile,
wearing a cream silk blouse with delicate gold earrings, soft natural studio
lighting, neutral beige backdrop, head-and-shoulders portrait, photorealistic,
sharp focus, ultra detailed."`;

/**
 * Describe an image as a portrait-generation prompt.
 *
 * @param {object} args
 * @param {Buffer} args.buffer - image bytes
 * @param {string} args.mimeType - e.g. 'image/jpeg'
 * @param {string} [args.model] - override default
 * @returns {Promise<{prompt: string, model: string}>}
 */
async function describeFromImage(args) {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
    const { buffer, mimeType, model } = args || {};
    if (!buffer) throw new Error('buffer is required');
    const m = model || DESCRIBE_MODEL;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;
    const body = {
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [
            {
                role: 'user',
                parts: [
                    { text: 'Write the portrait prompt for the person in this photo.' },
                    {
                        inline_data: {
                            mime_type: mimeType || 'image/jpeg',
                            data: buffer.toString('base64'),
                        },
                    },
                ],
            },
        ],
        generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 400,
        },
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
        throw new Error(`Gemini describe: ${data?.error?.message || `HTTP ${res.status}`}`);
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts
        .map((p) => p.text || '')
        .join('')
        .trim();
    if (!text) {
        const finish = data?.candidates?.[0]?.finishReason || 'no candidate';
        throw new Error(`Gemini describe: empty response (${finish})`);
    }
    // Strip surrounding quotes / markdown if any
    const cleaned = text
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/^```[a-z]*\n?|```$/gm, '')
        .trim();
    return { prompt: cleaned, model: m };
}

module.exports = { describeFromImage, DEFAULT_MODEL: DESCRIBE_MODEL };
