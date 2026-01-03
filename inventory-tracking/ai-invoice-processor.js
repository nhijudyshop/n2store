// =====================================================
// AI INVOICE PROCESSOR - Core AI Service Layer
// Handles Gemini API communication and data extraction
// =====================================================

console.log('[AI] Invoice processor initialized');

// =====================================================
// CONFIGURATION
// =====================================================

const AI_CONFIG = {
    GEMINI_PROXY_URL: 'https://n2store-fallback.onrender.com/api/gemini/chat',
    MODEL: 'gemini-3-flash-preview', // Same as telegram bot
    GENERATION_CONFIG: {
        temperature: 0.1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 4096
    }
};

// =====================================================
// CHINESE TO VIETNAMESE TRANSLATION
// Uses CHINESE_TO_VIETNAMESE dictionary from table-renderer.js
// =====================================================

/**
 * Translate Chinese text to Vietnamese
 * @param {string} text - Chinese text
 * @returns {string} Vietnamese text
 */
function translateToVietnamese(text) {
    if (!text) return text;

    // CHINESE_TO_VIETNAMESE is defined globally in table-renderer.js
    if (typeof CHINESE_TO_VIETNAMESE === 'undefined') {
        console.warn('[AI] CHINESE_TO_VIETNAMESE dictionary not found');
        return text;
    }

    let result = text;

    // Sort by length (longer first) to avoid partial replacements
    const sortedKeys = Object.keys(CHINESE_TO_VIETNAMESE)
        .sort((a, b) => b.length - a.length);

    for (const chinese of sortedKeys) {
        const vietnamese = CHINESE_TO_VIETNAMESE[chinese];
        result = result.split(chinese).join(vietnamese);
    }

    return result.trim();
}

// =====================================================
// INVOICE EXTRACTION PROMPT
// Copied from telegram-bot.js lines 801-986
// =====================================================

const INVOICE_EXTRACTION_PROMPT = `Bạn là chuyên gia kiểm kê hàng hóa thông thạo tiếng Trung chuyên ngành may mặc và tiếng Việt. Hãy phân tích ảnh hóa đơn này và trích xuất thông tin theo format JSON.

=== NGUYÊN TẮC QUAN TRỌNG ===

1. **DỊCH THUẬT TRIỆT ĐỂ**:
   - Chuyển TOÀN BỘ nội dung sang tiếng Việt
   - TUYỆT ĐỐI KHÔNG để sót ký tự tiếng Trung nào
   - Dịch cả tên sản phẩm, màu sắc, mô tả chi tiết
   - VD: "卡其色" → "Khaki" (KHÔNG giữ "卡其")
   - VD: "黑色" → "Đen" (KHÔNG giữ "黑色")
   - VD: "铆钉" → "Đinh tán" (KHÔNG giữ "铆钉")

2. **KIỂM TRA ĐỘ CHÍNH XÁC**:
   - Cộng tổng số lượng từng màu để đối chiếu với cột "Tổng cộng"
   - Nếu có sai lệch giữa các màu và tổng số → Đưa ra CẢNH BÁO trong notes
   - VD: "⚠️ CẢNH BÁO: Tổng màu (48) ≠ Tổng ghi (50) - Chênh lệch 2 món"

3. **THÔNG TIN NCC**:
   - CHỈ lấy STT được khoanh tròn
   - BỎ QUA tên, số điện thoại, địa chỉ NCC
   - Chỉ trả về ncc: "4" (số thuần túy)

=== TỪ ĐIỂN DỊCH TIẾNG TRUNG → TIẾNG VIỆT ===

**MÀU SẮC (颜色):**
黑色 = Đen, 白色 = Trắng, 红色 = Đỏ, 蓝色 = Xanh dương, 绿色 = Xanh lá cây
黄色 = Vàng, 紫色 = Tím, 粉色 = Hồng, 粉红色 = Hồng phấn, 灰色 = Xám, 棕色 = Nâu
咖色 = Nâu cà phê, 咖啡色 = Cà phê, 米色 = Kem, 米白色 = Trắng kem
杏色 = Hồng mơ, 橙色 = Cam, 酱色 = Nâu đậm, 酱红色 = Đỏ nâu
卡其色 = Khaki, 卡其 = Khaki, 驼色 = Nâu lạc đà, 驼 = Lạc đà
藏青色 = Xanh than, 藏青 = Xanh than, 酒红色 = Đỏ rượu vang, 酒红 = Đỏ rượu
墨绿色 = Xanh rêu, 墨绿 = Xanh rêu, 军绿色 = Xanh quân đội, 军绿 = Xanh lính
浅 = Nhạt, 深 = Đậm, 色 = (bỏ từ này)
浅灰 = Xám nhạt, 深灰 = Xám đậm, 浅蓝 = Xanh nhạt, 深蓝 = Xanh đậm

**LOẠI SẢN PHẨM (款式):**
上衣 = Áo, 裤子 = Quần, 裤 = Quần, 裙子 = Váy, 裙 = Váy
外套 = Áo khoác, 衬衫 = Áo sơ mi, T恤 = Áo thun, T恤衫 = Áo thun
连衣裙 = Váy liền, 针织衫 = Áo len, 毛衣 = Áo len, 卫衣 = Áo nỉ
打底衫 = Áo lót, 马甲 = Áo gile, 背心 = Áo ba lỗ, 吊带 = Dây đeo
短裤 = Quần short, 长裤 = Quần dài, 牛仔裤 = Quần jean

**MÔ TẢ/CHI TIẾT (细节):**
领 = Cổ, 袖 = Tay áo, 长袖 = Tay dài, 短袖 = Tay ngắn
交叉 = Chéo, 斜角 = Xéo góc, 条纹 = Sọc, 格子 = Caro, 花 = Hoa
圆领 = Cổ tròn, V领 = Cổ V, 高领 = Cổ cao, 翻领 = Cổ lật
纽扣 = Khuy, 拉链 = Khoá kéo, 铆钉 = Đinh tán, 印花 = In hoa
绣花 = Thêu hoa, 蕾丝 = Ren, 网纱 = Lưới, 荷叶边 = Viền lượn sóng

**CHẤT LIỆU (面料):**
棉 = Cotton, 麻 = Lanh, 丝 = Lụa, 绒 = Nhung, 毛 = Len
皮 = Da, 革 = Da thuộc, 牛仔 = Vải jean, 雪纺 = Voan
涤纶 = Polyester, 锦纶 = Nylon, 氨纶 = Spandex

**SIZE/KÍCH THƯỚC:**
均码 = Size chung, S码 = Size S, M码 = Size M, L码 = Size L, XL码 = Size XL

=== HƯỚNG DẪN TRÍCH XUẤT DỮ LIỆU ===

**1. MÃ NCC (ncc) - QUAN TRỌNG NHẤT:**
   - Tìm SỐ được KHOANH TRÒN bằng bút (thường màu đỏ)
   - Chỉ lấy STT số, BỎ QUA mọi thông tin khác về NCC
   - VD: Thấy số "4" khoanh tròn → ncc: "4"
   - VD: Thấy số "15" khoanh tròn → ncc: "15"
   - KHÔNG lấy tên shop, SĐT, địa chỉ

**2. TÊN NHÀ CUNG CẤP (supplier):**
   - Tên shop/cửa hàng IN ĐẬM ở đầu hóa đơn
   - DỊCH sang tiếng Việt nếu có nghĩa, HOẶC giữ nguyên + dịch
   - VD: "伊芙诺 (Eveno)" → supplier: "Eveno" HOẶC "伊芙诺"
   - VD: "添添酱" → supplier: "添添酱"

**3. NGÀY THÁNG (date):**
   - Tìm ngày in trên hóa đơn
   - Chuyển sang format DD/MM/YYYY
   - VD: "2025-12-08 10:56:52" → "08/12/2025"
   - VD: "打印日期: 2025/12/26" → "26/12/2025"
   - Nếu không có → để trống ""

**4. DANH SÁCH SẢN PHẨM (products):**

   **CẤU TRÚC HÓA ĐƠN ĐIỂN HÌNH:**

   | 款号/商品 | 颜色 | 均码 | 数量 | 单价 | 小计 |
   |----------|------|------|------|------|------|
   | 835#/T恤衫 | 黑色 | 均码 | 10 | 64 | 640 |
   | 835#/T恤衫 | 白色 | 均码 | 10 | 64 | 640 |
   | 835#/T恤衫 | 灰色 | 均码 | 10 | 64 | 640 |
   | 小计 |  |  | 30 |  | 1,920 |

   **QUAN TRỌNG - NHÓM SẢN PHẨM THEO MÃ:**
   - Các dòng có cùng款号 (mã sản phẩm) = 1 SẢN PHẨM DUY NHẤT
   - Gộp các màu khác nhau vào mảng colors[]
   - VD: 3 dòng "835#/T恤衫" với màu khác nhau = 1 object duy nhất với 3 màu

   **CẤU TRÚC NHÓM:**
   {
     "sku": "835",
     "name": "Áo thun",
     "colors": [
       {"color": "Đen", "quantity": 10},
       {"color": "Trắng", "quantity": 10},
       {"color": "Xám", "quantity": 10}
     ],
     "price": 64
   }

   **CÁCH ĐỌC VÀ NHÓM:**

   a) **sku** (Mã hàng):
      - Lấy từ cột "款号/商品" (phần số trước dấu /)
      - Bỏ ký tự # nếu có
      - VD: "835#/T恤衫" → sku: "835"
      - VD: "9151-1#/连衣裙" → sku: "9151-1"

   b) **name** (Tên sản phẩm/Mô tả):
      - Lấy từ cột "款号/商品" (phần sau dấu /)
      - DỊCH HOÀN TOÀN sang tiếng Việt
      - VD: "T恤衫" → "Áo thun"
      - VD: "连衣裙" → "Váy liền"
      - VD: "打底衫" → "Áo lót"
      - VD: "针织衫" → "Áo len"
      - VD: "两件套" → "Bộ hai mảnh"
      - VD: "三件套" → "Bộ ba mảnh"
      - Nếu không có tên → dùng "Sản phẩm [mã]"

   c) **colors** (Mảng màu sắc):
      - MỖI MÀU = 1 OBJECT trong colors[]
      - Với mỗi object:
        * **color**: DỊCH HOÀN TOÀN sang tiếng Việt theo TỪ ĐIỂN
          - VD: "黑色" → "Đen" (KHÔNG "黑色")
          - VD: "卡其色" → "Khaki" (KHÔNG "卡其")
          - VD: "藏青色" → "Xanh than" (KHÔNG "藏青")
        * **quantity**: Số lượng của màu đó
          - Lấy từ cột "数量" của dòng tương ứng
          - VD: 10, 20, 5, 13

   d) **price** (Đơn giá):
      - Giá của 1 sản phẩm (áp dụng cho TẤT CẢ màu)
      - Lấy từ cột "单价" (số nguyên hoặc thập phân)
      - VD: 64, 67.5, 66

   **LƯU Ý QUAN TRỌNG:**
   - NHÓM theo款号: Cùng mã SP → 1 object duy nhất
   - Màu khác nhau → Thêm vào colors[] của object đó
   - BỎ QUA dòng "小计" (tổng nhỏ của nhóm)
   - Hóa đơn có nhiều款号 → Nhiều objects trong products[]

**5. TỔNG SỐ MÓN (totalItems):**
   - Cộng tất cả quantity của từng product
   - VD: 10 + 10 + 10 + ... = 330
   - KIỂM TRA: Phải khớp với số "数量" ở dòng tổng cộng

**6. TỔNG TIỀN (totalAmount):**
   - Tìm dòng "销售合计", "合计", "总计"
   - Lấy số tiền, BỎ dấu phẩy và ký hiệu ¥
   - VD: "销售合计: ¥21,520.00" → totalAmount: 21520
   - VD: "合计: ¥3,200" → totalAmount: 3200
   - Nếu không có → Tính = SUM(quantity * price)

**7. KIỂM TRA VÀ CẢNH BÁO:**
   - Với mỗi sản phẩm trong products[], cộng quantity của các colors[]
   - So sánh với số "Tổng cộng" hoặc dòng "小计" của nhóm đó
   - Nếu KHỚP → OK
   - Nếu CHÊNH LỆCH → Thêm vào notes:
     "⚠️ CẢNH BÁO: Sản phẩm [sku] [name] - Tổng màu ([X]) ≠ Tổng ghi ([Y]) - Chênh lệch [Z] món"

=== FORMAT JSON OUTPUT ===

Trả về JSON CHÍNH XÁC (không markdown, không dấu \`\`\`):

{
  "success": true,
  "ncc": "4",
  "supplier": "伊芙诺",
  "date": "08/12/2025",
  "products": [
    {
      "sku": "835",
      "name": "Áo thun",
      "colors": [
        {"color": "Đen", "quantity": 10},
        {"color": "Trắng", "quantity": 10},
        {"color": "Xám", "quantity": 10},
        {"color": "Đỏ", "quantity": 7},
        {"color": "Khaki", "quantity": 13}
      ],
      "price": 64
    },
    {
      "sku": "9151-1",
      "name": "Váy liền",
      "colors": [
        {"color": "Xanh than", "quantity": 20},
        {"color": "Đen", "quantity": 15}
      ],
      "price": 72
    }
  ],
  "totalItems": 85,
  "totalAmount": 5720,
  "notes": "Ngày in: 2025-12-08. Đã kiểm tra: Tất cả nhóm sản phẩm khớp số lượng."
}

=== CHECKLIST TRƯỚC KHI TRẢ VỀ ===

- [ ] Mã NCC: Đã lấy đúng số khoanh tròn (không lấy tên/SĐT/địa chỉ)
- [ ] Tên sản phẩm: Đã dịch HOÀN TOÀN sang tiếng Việt (không còn ký tự Trung)
- [ ] Màu sắc: Đã dịch HOÀN TOÀN sang tiếng Việt theo TỪ ĐIỂN
- [ ] Số lượng: Đã cộng từng dòng, bỏ qua dòng "小计"
- [ ] Tổng số món: Đã kiểm tra = SUM(quantity)
- [ ] Tổng tiền: Đã kiểm tra khớp với "销售合计"
- [ ] Độ chính xác: Đã kiểm tra tổng màu = tổng ghi, nếu sai → cảnh báo
- [ ] Không bỏ sót: Đã đọc hết tất cả dòng sản phẩm trong hóa đơn

=== NẾU KHÔNG XỬ LÝ ĐƯỢC ===

{
  "success": false,
  "error": "Lý do cụ thể: Ảnh mờ không đọc được/Không phải hóa đơn/Thiếu thông tin quan trọng/Không tìm thấy mã NCC khoanh tròn"
}`;

// =====================================================
// CORE FUNCTIONS
// =====================================================

/**
 * Convert File object to base64 string
 * @param {File} file - Image file
 * @returns {Promise<string>} Base64 string (without data:image prefix)
 */
async function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            // Remove data:image/jpeg;base64, prefix
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };

        reader.onerror = (error) => reject(error);

        reader.readAsDataURL(file);
    });
}

/**
 * Call Gemini Vision API via backend proxy
 * @param {string} base64Image - Base64 encoded image
 * @param {string} mimeType - Image MIME type (e.g., 'image/jpeg')
 * @returns {Promise<Object>} AI response object
 */
async function callGeminiVisionAPI(base64Image, mimeType) {
    console.log('[AI] Calling Gemini API...');

    const response = await fetch(AI_CONFIG.GEMINI_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: AI_CONFIG.MODEL,
            contents: [{
                parts: [
                    { text: INVOICE_EXTRACTION_PROMPT },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Image
                        }
                    }
                ]
            }],
            generationConfig: AI_CONFIG.GENERATION_CONFIG
        })
    });

    if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message || 'Gemini API error');
    }

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
        throw new Error('Empty response from Gemini');
    }

    console.log('[AI] Received response from Gemini');

    // Clean markdown code blocks if present
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/```json?\n?/g, '').replace(/```/g, '');
    }

    // Parse JSON
    try {
        return JSON.parse(cleanJson);
    } catch (parseError) {
        console.error('[AI] JSON parse error:', parseError.message);
        console.error('[AI] Raw response:', responseText);
        return {
            success: false,
            error: 'Không thể parse kết quả từ AI',
            rawResponse: responseText
        };
    }
}

/**
 * Extract invoice data from AI response and convert to structured format
 * @param {Object} aiResponse - Response from Gemini API (NEW FORMAT with grouped products)
 * @returns {Object} Invoice data with structured productsData array
 */
function extractInvoiceData(aiResponse) {
    if (!aiResponse.success) {
        throw new Error(aiResponse.error || 'AI không thể xử lý ảnh');
    }

    // NEW: Process grouped products with color details
    const productsData = (aiResponse.products || []).map(product => {
        const colors = product.colors || [];
        const tongSoLuong = colors.reduce((sum, c) => sum + (c.quantity || 0), 0);

        return {
            maSP: product.sku || '?',
            moTa: product.name || '',           // NEW: Product description
            mauSac: colors.map(c => ({          // NEW: Color breakdown
                mau: c.color || '',
                soLuong: c.quantity || 0
            })),
            tongSoLuong: tongSoLuong,           // NEW: Computed total
            soMau: colors.length,                // Computed from array
            giaDonVi: product.price || 0,
            thanhTien: tongSoLuong * (product.price || 0),

            // Legacy/metadata
            rawText: buildRawText(product),     // Generate for display
            aiExtracted: true,
            dataSource: 'ai'
        };
    });

    return {
        sttNCC: parseInt(aiResponse.ncc, 10) || null,
        tenNCC: aiResponse.supplier || '',
        productsData: productsData,             // NEW: Rich structured data
        totalAmount: aiResponse.totalAmount || 0,
        totalItems: aiResponse.totalItems || 0,
        notes: aiResponse.notes || '',
        date: aiResponse.date || ''
    };
}

/**
 * Build rawText for display purposes from structured product data
 * @param {Object} product - AI product object with colors array
 * @returns {string} Raw text representation
 */
function buildRawText(product) {
    const sku = product.sku || '?';
    const name = product.name || '';
    const colorCount = (product.colors || []).length;
    const totalQty = (product.colors || []).reduce((sum, c) => sum + (c.quantity || 0), 0);
    const price = product.price || 0;

    // Format: "MA 835 Áo thun 5 MÀU 50X64"
    return `MA ${sku}${name ? ' ' + name : ''} ${colorCount} MÀU ${totalQty}X${price}`;
}

/**
 * Process invoice image - Main entry point
 * @param {File} imageFile - Image file to process
 * @returns {Promise<Object>} Processed invoice data
 */
async function processInvoiceImage(imageFile) {
    console.log('[AI] Processing invoice image:', imageFile.name);

    try {
        // Step 1: Convert to base64
        const base64 = await convertFileToBase64(imageFile);
        const mimeType = imageFile.type;

        console.log('[AI] Image converted to base64');

        // Step 2: Call Gemini API
        const aiResponse = await callGeminiVisionAPI(base64, mimeType);

        console.log('[AI] AI response:', aiResponse);

        // Step 3: Extract and format data
        const invoiceData = extractInvoiceData(aiResponse);

        console.log('[AI] Invoice data extracted:', invoiceData);

        return {
            success: true,
            data: invoiceData,
            rawAI: aiResponse
        };

    } catch (error) {
        console.error('[AI] Processing error:', error);

        return {
            success: false,
            error: error.message,
            file: imageFile
        };
    }
}

console.log('[AI] Functions exported: processInvoiceImage, translateToVietnamese');
