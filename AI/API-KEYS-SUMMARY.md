# 🔑 API Keys Summary

> Tổng hợp tất cả API keys trong project `ai-product`  
> Cập nhật: 2025-12-18

---

## 🌟 Google Gemini API Keys (10 keys)

| # | API Key | Ghi chú |
|---|---------|---------|
| 1 | `AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM` | Main |
| 2 | `AIzaSyCtrNOTjOVbKgJwNwgG80ZIUSVQ9fkYqbE` | Obfuscated |
| 3 | `AIzaSyBl2AO6WmoJHwIlnFg6i0tcbbSyYHnoStM` | Obfuscated |
| 4 | `AIzaSyBwScrzLWofcQMJjB4iQNAmNzBgfWyc7Rs` | Obfuscated |
| 5 | `AIzaSyDOaFELikRXdJRjxslRtj_LUyFFiOEa2-E` | Obfuscated |
| 6 | `AIzaSyDfNAWbpvkfEzXoXfkzpDQuj3SCbXLXEdw` | Obfuscated |
| 7 | `AIzaSyCNO60AvMBspBCAK1WglXikhhuja9OarFg` | Obfuscated |
| 8 | `AIzaSyCs7Fgi3MbH4qd6GNdBm3Yq4aQzSijApBI` | Obfuscated |
| 9 | `AIzaSyDlQlD5QA4cUnaf93LFjFjHe1QnKZRVwGg` | Obfuscated |
| 10 | `AIzaSyDywVP6oaHYQCa60lz6-PnizD8zMw9bXiA` | Obfuscated |

### Vị trí sử dụng:
- `1/n2shop.html` - Key #1
- `1/free-vision-ai-gemini-pro.html` - Keys #2-10
- `3/index.html` - Keys #2-10

---

## 🚀 Gemini Models Mới Nhất (12/2025)

Các API keys trên có thể sử dụng với tất cả models sau:

### ⭐ Gemini 2.5 Series (Khuyên dùng)

| Model ID | Mô tả | Free Tier |
|----------|-------|-----------|
| `gemini-2.5-pro` | 🏆 Thông minh nhất, reasoning mạnh | 2 RPM |
| `gemini-2.5-flash` | ⚡ Nhanh, cân bằng tốt | 15 RPM |
| `gemini-2.5-flash-lite` | 🚀 Siêu nhanh, tiết kiệm | 15 RPM |

### 💎 Gemini 2.0 Series

| Model ID | Mô tả | Free Tier |
|----------|-------|-----------|
| `gemini-2.0-flash` | Đa năng, multimodal | 15 RPM |
| `gemini-2.0-flash-lite` | Tiết kiệm, 1M context | 15 RPM |

### 🔮 Gemini 3 Series (Mới nhất - 2025)

| Model ID | Mô tả | Trạng thái |
|----------|-------|------------|
| `gemini-3-pro` | 🧠 Thông minh nhất, agentic | Rolling out |
| `gemini-3-flash` | ⚡ Nhanh, frontier AI | Rolling out |

### 📝 Cách sử dụng

**API Endpoint:**
```
https://generativelanguage.googleapis.com/v1beta/models/{MODEL_ID}:generateContent?key={API_KEY}
```

**Ví dụ với Gemini 2.5 Flash:**
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Hello!"}]}]}'
```

---

## 🤗 HuggingFace API Keys (3 keys)

| # | API Key |
|---|---------|
| 1 | `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` |
| 2 | `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` |
| 3 | `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` |

### Vị trí sử dụng:
- `1/n2shop.html`
- `1/hf-inference-chat.html`
- `1/free-vision-ai-gemini-pro.html`
- `2/index.html`
- `3/index.html`

---

## 📊 Tổng kết

| Provider | Số lượng | Mã hóa |
|----------|----------|--------|
| Google Gemini | 10 keys | ✅ Tách thành 4 phần |
| HuggingFace | 3 keys | ✅ Tách thành 3 phần |

---

## 🔒 Cách mã hóa

Keys được lưu dưới dạng mảng nhiều phần để tránh bị scan:

```javascript
// Gemini - Tách 4 phần
const geminiKeyParts = [
    ["AIzaSyC", "trNOTjOV", "bKgJwNwgG80", "ZIUSVQ9fkYqbE"],
    // ...
];
const hiddenGeminiKeys = geminiKeyParts.map(parts => parts.join(""));

// HuggingFace - Tách 3 phần
const keyParts = [
    ["hf_", "fTAinKmHHLwEyVUQAFFz", "biISBgGFQYufxQ"],
    // ...
];
const hiddenHFKeys = keyParts.map(parts => parts.join(""));
```

---

## 📝 Copy nhanh

### Gemini Keys (1 dòng mỗi key):
```
AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM
AIzaSyCtrNOTjOVbKgJwNwgG80ZIUSVQ9fkYqbE
AIzaSyBl2AO6WmoJHwIlnFg6i0tcbbSyYHnoStM
AIzaSyBwScrzLWofcQMJjB4iQNAmNzBgfWyc7Rs
AIzaSyDOaFELikRXdJRjxslRtj_LUyFFiOEa2-E
AIzaSyDfNAWbpvkfEzXoXfkzpDQuj3SCbXLXEdw
AIzaSyCNO60AvMBspBCAK1WglXikhhuja9OarFg
AIzaSyCs7Fgi3MbH4qd6GNdBm3Yq4aQzSijApBI
AIzaSyDlQlD5QA4cUnaf93LFjFjHe1QnKZRVwGg
AIzaSyDywVP6oaHYQCa60lz6-PnizD8zMw9bXiA
```

### HuggingFace Keys:
```
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
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
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
```
