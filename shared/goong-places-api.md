# Goong.io Places API - Autocomplete

Hướng dẫn tích hợp Goong.io Autocomplete vào n2store.

## Tổng quan

- **Chức năng**: Nhập địa chỉ không đầy đủ → trả về địa chỉ đầy đủ (autocomplete)
- **Free tier**: $100 credit khi đăng ký (~30,000 requests/tháng)
- **Docs**: https://docs.goong.io/rest/place

## Setup

### 1. Tạo API Key

1. Đăng ký tại https://account.goong.io
2. Tạo API Key trong dashboard

### 2. Thêm API Key vào Render.com

1. Vào [Render Dashboard](https://dashboard.render.com/)
2. Chọn service `n2store-fallback`
3. **Environment** → Add Environment Variable:
   - Key: `GOONG_API_KEY`
   - Value: `<API key từ bước 1>`

## Kiến trúc

```
Browser (client)
    ↓ GET /api/goong-places/autocomplete?input=...
Render.com (server) - giữ API key an toàn
    ↓ GET https://rsapi.goong.io/Place/AutoComplete?input=...&api_key=...
Goong.io API
    ↓ Response
Render.com → Browser
```

## Server Route

File: `render.com/routes/goong-places.js`
Endpoint: `GET /api/goong-places/autocomplete?input=<địa chỉ>`

### Query Parameters

| Param | Bắt buộc | Mặc định | Mô tả |
|-------|---------|----------|-------|
| `input` | Có | - | Địa chỉ cần tìm (>= 2 ký tự) |
| `limit` | Không | 5 | Số kết quả trả về |
| `more_compound` | Không | true | Trả thêm thông tin phường/quận/tỉnh |

## Client-side Usage

```javascript
const RENDER_URL = 'https://n2store-fallback.onrender.com';

/**
 * Tìm địa chỉ autocomplete từ Goong.io
 * @param {string} input - Địa chỉ không đầy đủ (vd: "123 nguyễn huệ")
 * @returns {Promise<Array>} - Danh sách gợi ý địa chỉ
 */
async function searchAddress(input) {
    if (!input || input.trim().length < 2) return [];

    const params = new URLSearchParams({ input: input.trim() });
    const response = await fetch(`${RENDER_URL}/api/goong-places/autocomplete?${params}`);
    const data = await response.json();

    if (data.status !== 'OK') return [];

    return (data.predictions || []).map(p => ({
        description: p.description || '',
        placeId: p.place_id || '',
        mainText: p.structured_formatting?.main_text || '',
        secondaryText: p.structured_formatting?.secondary_text || '',
        compound: p.compound || null  // { commune, district, province }
    }));
}
```

### Ví dụ tích hợp với input field

```javascript
function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

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
            <div class="address-suggestion" data-text="${s.description}">
                <strong>${s.mainText}</strong>
                <small>${s.secondaryText}</small>
            </div>
        `).join('');
        dropdownElement.style.display = 'block';

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

```json
{
    "predictions": [
        {
            "description": "123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh",
            "place_id": "...",
            "structured_formatting": {
                "main_text": "123 Nguyễn Huệ",
                "secondary_text": "Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh"
            },
            "compound": {
                "commune": "Phường Bến Nghé",
                "district": "Quận 1",
                "province": "Thành phố Hồ Chí Minh"
            }
        }
    ],
    "status": "OK"
}
```

## Lưu ý

- **Debounce**: Luôn debounce input (300ms+) để tiết kiệm requests
- **Min length**: Chỉ gọi API khi input >= 2 ký tự
- **more_compound**: Bật để lấy thêm commune/district/province (hữu ích cho đơn hàng)
- **Free tier**: $100 credit ~ 30,000 requests/tháng
- **Rate limit**: Max 5 requests/giây
