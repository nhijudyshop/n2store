# 🤖 Google Gemini AI - Hướng Dẫn Sử Dụng

> Tất cả chức năng có thể dùng với 10 API keys hiện có  
> Cập nhật: 12/2025

---

## 🔑 API Keys Hiện Có

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

---

## 📋 Tất Cả Chức Năng Gemini API

### 1️⃣ Text Generation (Tạo văn bản)

```javascript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Viết bài giới thiệu sản phẩm" }] }]
    })
  }
);
```

---

### 2️⃣ Vision - Phân Tích Hình Ảnh

```javascript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: base64Image } },
          { text: "Mô tả hình ảnh này" }
        ]
      }]
    })
  }
);
```

**Hỗ trợ:** JPG, PNG, WEBP, GIF, PDF

---

### 3️⃣ Audio - Xử Lý Âm Thanh

```javascript
// Transcribe audio
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
  {
    method: 'POST',
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: "audio/mp3", data: base64Audio } },
          { text: "Chuyển audio này thành text tiếng Việt" }
        ]
      }]
    })
  }
);
```

**Chức năng:** Transcription, Translation, Speaker Detection, Emotion Detection

---

### 4️⃣ Video Analysis - Phân Tích Video

```javascript
// Phân tích YouTube video
const response = await fetch(url, {
  body: JSON.stringify({
    contents: [{
      parts: [
        { text: "Tóm tắt video này" },
        { file_data: { file_uri: "https://youtube.com/watch?v=xxxxx" } }
      ]
    }]
  })
});
```

---

### 5️⃣ Code Execution - Chạy Code Python

```javascript
const response = await fetch(url, {
  body: JSON.stringify({
    contents: [{ parts: [{ text: "Tính 15! (giai thừa)" }] }],
    tools: [{ code_execution: {} }]
  })
});
```

**Thư viện có sẵn:** NumPy, Pandas, Matplotlib

---

### 6️⃣ Function Calling - Gọi Hàm

```javascript
const response = await fetch(url, {
  body: JSON.stringify({
    contents: [{ parts: [{ text: "Thời tiết Hà Nội hôm nay" }] }],
    tools: [{
      function_declarations: [{
        name: "get_weather",
        description: "Lấy thông tin thời tiết",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string", description: "Tên thành phố" }
          },
          required: ["location"]
        }
      }]
    }]
  })
});
```

---

### 7️⃣ Grounding - Tìm Kiếm Google

```javascript
const response = await fetch(url, {
  body: JSON.stringify({
    contents: [{ parts: [{ text: "Tin tức mới nhất về AI" }] }],
    tools: [{ google_search: {} }]
  })
});
```

**Kết quả:** Thông tin real-time từ Google Search với citations

---

### 8️⃣ Structured Output - JSON Response

```javascript
const response = await fetch(url, {
  body: JSON.stringify({
    contents: [{ parts: [{ text: "Phân tích sản phẩm này" }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          price: { type: "number" },
          category: { type: "string" }
        }
      }
    }
  })
});
```

---

## 🚀 Models Khuyên Dùng

| Model | Use Case | Free Tier |
|-------|----------|-----------|
| `gemini-2.5-flash` | ⚡ Đa năng, nhanh | 15 RPM |
| `gemini-2.5-pro` | 🏆 Complex reasoning | 2 RPM |
| `gemini-2.5-flash-lite` | 🚀 Siêu nhanh, rẻ | 15 RPM |

---

## 📊 So Sánh Chức Năng

| Chức năng | 2.5 Flash | 2.5 Pro | 2.0 Flash |
|-----------|:---------:|:-------:|:---------:|
| Text Generation | ✅ | ✅ | ✅ |
| Vision (Image) | ✅ | ✅ | ✅ |
| Audio | ✅ | ✅ | ✅ |
| Video | ✅ | ✅ | ✅ |
| Code Execution | ✅ | ✅ | ✅ |
| Function Calling | ✅ | ✅ | ✅ |
| Grounding (Search) | ✅ | ✅ | ✅ |
| Thinking Mode | ✅ | ✅ | ❌ |
| 1M Token Context | ✅ | ✅ | ✅ |

---

## 💡 Tips

1. **Rate Limit:** Mỗi key có giới hạn riêng, dùng rotation để tăng throughput
2. **Fallback:** Nếu một model fail, tự động chuyển sang model khác
3. **Caching:** Cache response để tiết kiệm quota
4. **Batch:** Gộp nhiều request thành 1 để tối ưu

---

## 🔗 Tài Liệu Chính Thức

- [Google AI Studio](https://aistudio.google.com/)
- [Gemini API Docs](https://ai.google.dev/docs)
- [API Reference](https://ai.google.dev/api)
