# Google Places API - Autocomplete

Hướng dẫn tích hợp Google Places API Autocomplete vào n2store.

## Tổng quan

- **Chức năng**: Nhập địa chỉ không đầy đủ → trả về địa chỉ đầy đủ (autocomplete)
- **Free tier**: 10,000 requests/tháng (miễn phí)
- **Pricing**: Sau 10,000 → $2.83/1,000 requests

## Setup Google Cloud

### 1. Tạo API Key

1. Vào [Google Cloud Console](https://console.cloud.google.com/)
2. Tạo hoặc chọn project
3. Vào **APIs & Services** → **Library** → Enable **Places API (New)**
4. Vào **APIs & Services** → **Credentials** → **Create Credentials** → **API Key**
5. Restrict API Key:
   - **API restrictions** → Chọn **Places API (New)**
   - (Không cần restrict HTTP referrer vì key dùng server-side)

### 2. Thêm API Key vào Render.com

1. Vào [Render Dashboard](https://dashboard.render.com/)
2. Chọn service `n2store-fallback`
3. **Environment** → Add Environment Variable:
   - Key: `GOOGLE_PLACES_API_KEY`
   - Value: `<API key từ bước 1>`

## Kiến trúc

```
Browser (client)
    ↓ POST /api/google-places/autocomplete
Render.com (server) - giữ API key an toàn
    ↓ POST https://places.googleapis.com/v1/places:autocomplete
Google Places API
    ↓ Response
Render.com → Browser
```

## Server Route (Render.com)

File: `render.com/routes/google-places.js`

```javascript
const express = require('express');
const router = express.Router();

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_API_URL = 'https://places.googleapis.com/v1/places:autocomplete';

// Health check
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Google Places Autocomplete Proxy',
        hasApiKey: !!GOOGLE_PLACES_API_KEY
    });
});

// Autocomplete endpoint
// POST /api/google-places/autocomplete
// Body: { input: "123 nguyễn huệ", languageCode?: "vi", regionCode?: "VN" }
router.post('/autocomplete', async (req, res) => {
    try {
        if (!GOOGLE_PLACES_API_KEY) {
            return res.status(500).json({
                error: { message: 'GOOGLE_PLACES_API_KEY not configured on server' }
            });
        }

        const { input, languageCode = 'vi', regionCode = 'VN' } = req.body;

        if (!input || input.trim().length < 2) {
            return res.status(400).json({
                error: { message: 'Input must be at least 2 characters' }
            });
        }

        const requestBody = {
            input: input.trim(),
            languageCode,
            regionCode,
            includedRegionCodes: [regionCode]
        };

        const response = await fetch(PLACES_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        res.json(data);

    } catch (error) {
        console.error('[GOOGLE-PLACES] Error:', error.message);
        res.status(500).json({
            error: { message: 'Proxy server error: ' + error.message }
        });
    }
});

module.exports = router;
```

## Đăng ký route trong server.js

```javascript
// Thêm vào phần require
const googlePlacesRoutes = require('./routes/google-places');

// Thêm vào phần app.use
app.use('/api/google-places', googlePlacesRoutes);
```

## Client-side Usage

### ES Module (Browser)

```javascript
const RENDER_URL = 'https://n2store-fallback.onrender.com';

/**
 * Tìm địa chỉ autocomplete từ Google Places API
 * @param {string} input - Địa chỉ không đầy đủ (vd: "123 nguyễn huệ")
 * @returns {Promise<Array>} - Danh sách gợi ý địa chỉ
 */
async function searchAddress(input) {
    if (!input || input.trim().length < 2) return [];

    const response = await fetch(`${RENDER_URL}/api/google-places/autocomplete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: input.trim() })
    });

    const data = await response.json();

    if (data.error) {
        console.error('Places API error:', data.error.message);
        return [];
    }

    // Trả về danh sách suggestions
    return (data.suggestions || []).map(s => ({
        text: s.placePrediction?.text?.text || '',
        placeId: s.placePrediction?.placeId || '',
        mainText: s.placePrediction?.structuredFormat?.mainText?.text || '',
        secondaryText: s.placePrediction?.structuredFormat?.secondaryText?.text || ''
    }));
}
```

### Ví dụ tích hợp với input field

```javascript
// Debounce để tránh gọi API quá nhiều
function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// Setup autocomplete cho input
function setupAddressAutocomplete(inputElement, dropdownElement) {
    const handleInput = debounce(async (e) => {
        const query = e.target.value;
        if (query.length < 2) {
            dropdownElement.style.display = 'none';
            return;
        }

        const suggestions = await searchAddress(query);

        if (suggestions.length === 0) {
            dropdownElement.style.display = 'none';
            return;
        }

        dropdownElement.innerHTML = suggestions.map(s => `
            <div class="address-suggestion" data-text="${s.text}">
                <strong>${s.mainText}</strong>
                <small>${s.secondaryText}</small>
            </div>
        `).join('');

        dropdownElement.style.display = 'block';

        // Click handler cho từng suggestion
        dropdownElement.querySelectorAll('.address-suggestion').forEach(el => {
            el.addEventListener('click', () => {
                inputElement.value = el.dataset.text;
                dropdownElement.style.display = 'none';
            });
        });
    }, 300);

    inputElement.addEventListener('input', handleInput);
}
```

## Response Format

### Autocomplete Response

```json
{
    "suggestions": [
        {
            "placePrediction": {
                "placeId": "ChIJ...",
                "text": {
                    "text": "123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh, Việt Nam"
                },
                "structuredFormat": {
                    "mainText": { "text": "123 Nguyễn Huệ" },
                    "secondaryText": { "text": "Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh, Việt Nam" }
                }
            }
        }
    ]
}
```

## Lưu ý

- **Debounce**: Luôn debounce input (300ms+) để tiết kiệm requests
- **Min length**: Chỉ gọi API khi input >= 2 ký tự
- **regionCode**: Mặc định `"VN"` để ưu tiên kết quả Việt Nam
- **languageCode**: Mặc định `"vi"` để kết quả tiếng Việt
- **Free tier**: 10,000 requests/tháng ~ 2,000-3,000 lần nhập địa chỉ (mỗi lần ~3-5 requests)
