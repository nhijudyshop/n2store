# Project Instructions for Claude Code

## Documentation to Read

When working on this project, always reference the documentation in `/docs` folder for understanding the project structure and conventions.

### Key Documentation Files:
- `docs/` - Contains comprehensive documentation about all modules and folders
- `shared/README.md` - Shared library documentation (auth, cache, utils, TPOS client)

## Shared Library Structure

Project sử dụng shared library tại `/shared/` folder:

```
/shared/
├── universal/      # ES Modules - Works in Browser + Node.js
├── browser/        # ES Modules - Browser only (SOURCE OF TRUTH)
├── js/             # Legacy Script-Tag Compatible (window.*)
├── node/           # ES Modules - Node.js only
└── README.md
```

### Import Paths

**HTML files sử dụng script tags:**
```html
<script src="../shared/js/core-loader.js"></script>
<script src="../shared/js/navigation-modern.js"></script>
<script src="../shared/js/common-utils.js"></script>
```

**ES Modules:**
```javascript
import { AuthManager, CommonUtils } from '/shared/browser/index.js';
import { TPOSClient, fetchWithRetry } from '/shared/universal/index.js';
```

### Troubleshooting - Lỗi Import Path

Nếu gặp lỗi như:
- `404 Not Found` khi load script
- `Module not found`
- `Cannot resolve module`

**Kiểm tra:**
1. Đường dẫn script trong HTML phải là `../shared/js/...` (không phải `../js/...`)
2. ES Module imports phải trỏ đến `/shared/browser/` hoặc `/shared/universal/`
3. Chạy: `grep -r '../js/' . --include="*.html"` để tìm paths cũ cần update

### Source of Truth

| Loại | ES Module (SOURCE OF TRUTH) | Script-Tag Version |
|------|----------------------------|-------------------|
| Auth | `/shared/browser/auth-manager.js` | `/shared/js/shared-auth-manager.js` |
| Cache | `/shared/browser/persistent-cache.js` | `/shared/js/shared-cache-manager.js` |
| Logger | `/shared/browser/logger.js` | `/shared/js/logger.js` |
| DOM Utils | `/shared/browser/dom-utils.js` | `/shared/js/dom-utils.js` |
| Common Utils | `/shared/browser/common-utils.js` | `/shared/js/common-utils.js` |
| TPOS Client | `/shared/universal/tpos-client.js` | `/shared/js/tpos-config.js` |

## Module-Specific Instructions

### orders-report Module
When working in the `orders-report/` directory, always read these files first:
- `orders-report/.ai-instructions.md` - AI-specific coding instructions
- `orders-report/ARCHITECTURE.md` - System architecture overview
- `orders-report/MODULE_MAP.md` - Module structure and dependencies

## File Organization

### Separate CSS and JS Files for New Features
Khi code phần mới (feature, module, page mới), **luôn hỏi người dùng** trước khi tạo file:
- Có muốn tạo file CSS riêng cho phần này không? (ví dụ: `feature-name.css`)
- Có muốn tạo file JS riêng cho phần này không? (ví dụ: `feature-name.js`)

Điều này giúp:
- Tách biệt code, dễ bảo trì
- Tránh file CSS/JS chính trở nên quá lớn
- Dễ debug và tìm kiếm code

## Database

Use environment variables or `.pgpass` file for PostgreSQL credentials. Never hardcode passwords.
