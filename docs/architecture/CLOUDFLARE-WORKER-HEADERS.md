# Cloudflare Worker — Quy tắc Headers khi proxy tới TPOS

## Vấn đề đã gặp (Bug thực tế)

Token handler (`/api/token`) dùng `new Headers(request.headers)` — copy **toàn bộ headers từ browser** rồi forward sang TPOS. TPOS nhận được headers lạ (Host, CF-*, Accept-Encoding, sec-fetch-*, ...) và **reject 400 Bad Request**.

```javascript
// SAI — copy toàn bộ headers browser → TPOS reject 400
const headers = new Headers(request.headers);
headers.set('Origin', 'https://tomato.tpos.vn/');
```

```javascript
// ĐÚNG — chỉ gửi headers cần thiết
const headers = new Headers();
headers.set('Content-Type', 'application/x-www-form-urlencoded');
headers.set('Origin', 'https://tomato.tpos.vn/');
headers.set('Referer', 'https://tomato.tpos.vn/');
```

## Quy tắc chung

### KHÔNG BAO GIỜ copy toàn bộ request headers

```javascript
// TUYỆT ĐỐI KHÔNG LÀM THẾ NÀY
const headers = new Headers(request.headers);
```

Browser gửi kèm rất nhiều headers mà TPOS không chấp nhận:

| Header dư thừa | Lý do gây lỗi |
|----------------|----------------|
| `Host: chatomni-proxy.nhijudyshop.workers.dev` | Sai domain, TPOS reject |
| `CF-Connecting-IP`, `CF-Ray`, `CF-IPCountry` | Headers nội bộ Cloudflare |
| `Accept-Encoding: br, gzip` | Có thể gây lỗi decode |
| `sec-fetch-mode`, `sec-fetch-site`, `sec-fetch-dest` | Browser security headers, API không cần |
| `cookie` | Cookie của worker domain, không phải TPOS |

### Luôn dùng `buildTposHeaders(request)` hoặc tạo Headers sạch

**Với TPOS OData/REST API** — dùng `buildTposHeaders(request)`:
```javascript
// File: modules/utils/header-learner.js
// Chỉ copy Authorization từ request, còn lại tạo sạch
const tposHeaders = buildTposHeaders(request);
```

`buildTposHeaders` chỉ lấy `Authorization` từ request, tất cả headers khác đều tạo mới với giá trị cố định phù hợp TPOS.

**Với TPOS Token endpoint** — tạo Headers sạch:
```javascript
const headers = new Headers();
headers.set('Content-Type', 'application/x-www-form-urlencoded');
headers.set('Origin', 'https://tomato.tpos.vn/');
headers.set('Referer', 'https://tomato.tpos.vn/');
```

## Headers TPOS cần nhận

### Token endpoint (`/token`)
| Header | Giá trị | Bắt buộc |
|--------|---------|----------|
| `Content-Type` | `application/x-www-form-urlencoded` | Yes |
| `Origin` | `https://tomato.tpos.vn/` | Yes |
| `Referer` | `https://tomato.tpos.vn/` | Yes |

### OData/REST API
| Header | Giá trị | Bắt buộc |
|--------|---------|----------|
| `Authorization` | `Bearer {token}` (từ client request) | Yes |
| `Content-Type` | `application/json;IEEE754Compatible=false;charset=utf-8` | Yes |
| `Origin` | `https://tomato.tpos.vn` | Yes |
| `Referer` | `https://tomato.tpos.vn/` | Yes |
| `tposappversion` | Dynamic, học từ response | Yes |
| `User-Agent` | Chrome UA string | Recommended |

## Ngoại lệ: `handleTposGeneric`

`handleTposGeneric` (catch-all proxy) **CÓ** dùng `new Headers(request.headers)` vì nó cần forward đúng headers client gửi (VD: custom Content-Type cho upload). Nhưng nó vẫn override `Origin` và `Referer`.

```javascript
// Chỉ chấp nhận ở catch-all proxy — KHÔNG copy pattern này sang handler khác
const headers = new Headers(request.headers);
headers.set('Origin', 'https://tomato.tpos.vn/');
headers.set('Referer', 'https://tomato.tpos.vn/');
```

## File liên quan

- `modules/handlers/token-handler.js` — Token endpoint
- `modules/handlers/tpos-handler.js` — TPOS OData/REST handlers
- `modules/utils/header-learner.js` — `buildTposHeaders()` helper
- `modules/utils/cors-utils.js` — CORS response headers
