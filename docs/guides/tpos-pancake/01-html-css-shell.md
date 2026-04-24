# Phase 0-2 — HTML shell + CSS design tokens + layout

## Phase 0 — Tạo thư mục + dependencies

### Mục tiêu
Thư mục rỗng, index.html rỗng, load được Firebase + Lucide + font.

### Files
Tạo cây thư mục như ở [README.md](README.md#cây-thư-mục-cuối-cùng). Tất cả `.js`/`.css` hãy để rỗng tạm thời.

### index.html — khung tối thiểu

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Cache-Control" content="no-cache, must-revalidate">
    <title>TPOS × Pancake</title>

    <!-- CSS (load theo thứ tự) -->
    <link rel="stylesheet" href="css/variables.css?v=1">
    <link rel="stylesheet" href="css/layout.css?v=1">
    <link rel="stylesheet" href="css/components.css?v=1">
    <link rel="stylesheet" href="css/pancake-chat.css?v=1">
    <link rel="stylesheet" href="css/tpos-chat.css?v=1">
    <link rel="stylesheet" href="css/tpos/tpos-comments.css?v=1">
    <link rel="stylesheet" href="css/pancake/pancake-chat-window.css?v=1">

    <!-- Lucide icons -->
    <script src="https://unpkg.com/lucide@0.294.0/dist/umd/lucide.min.js" defer></script>

    <!-- Firebase compat SDK 10.14.1 -->
    <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-database-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-storage-compat.js"></script>

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
</head>
<body>
    <!-- Topbar + columns + modals sẽ thêm ở Phase 1 -->
    <!-- Script tags sẽ thêm dần ở các Phase sau -->
</body>
</html>
```

### Verify
- Mở trang trong browser → trắng tinh, devtools console không đỏ.
- Tab Network: firebase 4 files load 200, lucide.min.js load 200, 7 file CSS load 200 (dù đang rỗng).

---

## Phase 1 — CSS design tokens (`variables.css`)

### Mục tiêu
Định nghĩa một lần cho toàn app: palette, shadow, spacing, transition, border radius.

### `css/variables.css`

```css
:root {
    /* --- Brand / semantic colors --- */
    --primary:        #6366f1;
    --primary-dark:   #4f46e5;
    --primary-light:  #818cf8;
    --secondary:      #8b5cf6;
    --success:        #10b981;
    --danger:         #ef4444;
    --warning:        #f59e0b;
    --info:           #3b82f6;

    /* --- Grayscale --- */
    --gray-50:  #f9fafb;
    --gray-100: #f3f4f6;
    --gray-200: #e5e7eb;
    --gray-300: #d1d5db;
    --gray-400: #9ca3af;
    --gray-500: #6b7280;
    --gray-600: #4b5563;
    --gray-700: #374151;
    --gray-800: #1f2937;
    --gray-900: #111827;

    /* --- Surfaces / text --- */
    --surface:         #ffffff;
    --bg:              #f9fafb;
    --border:          var(--gray-200);
    --text-primary:    var(--gray-900);
    --text-secondary:  var(--gray-600);
    --text-tertiary:   var(--gray-400);

    /* --- Column accent colors --- */
    --tpos-color:    #3b82f6;
    --tpos-bg:       #eff6ff;
    --pancake-color: #f59e0b;
    --pancake-bg:    #fffbeb;

    /* --- Shadows (Tailwind-ish) --- */
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow:    0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px 0 rgb(0 0 0 / 0.06);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -1px rgb(0 0 0 / 0.06);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -2px rgb(0 0 0 / 0.05);
    --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 10px 10px -5px rgb(0 0 0 / 0.04);

    /* --- Spacing --- */
    --spacing-xs: 0.25rem;
    --spacing-sm: 0.5rem;
    --spacing-md: 1rem;
    --spacing-lg: 1.5rem;
    --spacing-xl: 2rem;

    /* --- Border radius --- */
    --radius-sm: 0.25rem;
    --radius:    0.5rem;
    --radius-md: 0.75rem;
    --radius-lg: 1rem;
    --radius-xl: 1.5rem;
    --radius-full: 9999px;

    /* --- Transitions (cubic-bezier shared) --- */
    --ease: cubic-bezier(0.4, 0, 0.2, 1);
    --transition-fast: 150ms var(--ease);
    --transition:      200ms var(--ease);
    --transition-slow: 300ms var(--ease);

    /* --- Fonts --- */
    --font-sans:    'Inter', system-ui, -apple-system, sans-serif;
    --font-display: 'Manrope', 'Inter', sans-serif;

    /* --- Sizes --- */
    --topbar-height: 48px;
}

html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--text-primary);
    background: var(--bg);
    -webkit-font-smoothing: antialiased;
}

*, *::before, *::after { box-sizing: border-box; }

button, input, select, textarea {
    font-family: inherit;
    font-size: inherit;
    color: inherit;
}

button { cursor: pointer; }
a { color: inherit; text-decoration: none; }
```

### Verify
F12 → Inspect `:root` → thấy tất cả biến trên. `var(--primary)` trả về `#6366f1`.

---

## Phase 2 — Layout (`layout.css` + `components.css`) + skeleton HTML

### Mục tiêu
Topbar cố định 48px trên cùng. Bên dưới là container flex chiếm hết màn hình, gồm 2 cột bằng nhau với resize handle 8px ở giữa.

### `css/layout.css`

```css
body {
    display: flex;
    flex-direction: column;
}

/* === TOPBAR === */
.top-bar {
    height: var(--topbar-height);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
    gap: 12px;
}
.top-bar-left, .top-bar-right {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.top-bar-divider {
    width: 1px;
    height: 24px;
    background: var(--border);
    flex-shrink: 0;
}
.top-bar-title {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 13px;
    letter-spacing: -0.01em;
    white-space: nowrap;
}

/* === DUAL COLUMN === */
.dual-column-section {
    flex: 1;
    display: flex;
    padding: 12px;
    min-height: 0;
}
.dual-column-container {
    flex: 1;
    display: flex;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    min-height: 0;
}
.column-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 300px;
    min-height: 0;
    transition: flex var(--transition);
}
.column-content {
    flex: 1;
    overflow: hidden;
    background: white;
    min-height: 0;
    max-height: 100%;
}
.column-wrapper.fullscreen { flex: 1 !important; }
.column-wrapper.hidden     { display: none !important; }

/* === RESIZE HANDLE === */
.resize-handle {
    width: 8px;
    background: var(--gray-100);
    cursor: col-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--transition-fast);
    flex-shrink: 0;
    position: relative;
}
.resize-handle::before {
    content: '';
    width: 2px;
    height: 32px;
    background: var(--gray-300);
    border-radius: 1px;
    transition: background var(--transition-fast);
}
.resize-handle:hover           { background: var(--gray-200); }
.resize-handle:hover::before   { background: var(--gray-400); }
.resize-handle.active          { background: var(--primary-light); }
.resize-handle.active::before  { background: var(--primary); }

/* === SETTINGS PANEL (floating) === */
.settings-panel {
    display: none;
    position: fixed;
    top: calc(var(--topbar-height) + 10px);
    right: var(--spacing-xl);
    width: 360px;
    background: var(--surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    border: 1px solid var(--border);
    z-index: 200;
    animation: slideDown 0.2s var(--ease);
}
.settings-panel.show { display: block; }
@keyframes slideDown {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
}
```

### `css/components.css`

```css
/* === BUTTONS === */
.btn {
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius);
    border: none;
    background: transparent;
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-weight: 500;
    transition: all var(--transition-fast);
}
.btn-primary   { background: var(--primary); color: white; }
.btn-primary:hover { background: var(--primary-dark); }
.btn-secondary { background: var(--gray-100); color: var(--text-primary); }
.btn-secondary:hover { background: var(--gray-200); }

.btn-icon {
    width: 36px; height: 36px;
    display: inline-flex; align-items: center; justify-content: center;
    border: none; background: transparent;
    border-radius: var(--radius);
    transition: all var(--transition-fast);
    color: var(--gray-600);
}
.btn-icon:hover { background: var(--gray-100); color: var(--text-primary); }

/* === BADGES === */
.badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    font-size: 0.6875rem;
    font-weight: 600;
    white-space: nowrap;
}
.badge-primary { background: var(--primary); color: white; }
.badge-success { background: var(--success); color: white; }
.badge-danger  { background: var(--danger);  color: white; }
.badge-warning { background: var(--warning); color: white; }
.badge-info    { background: var(--info);    color: white; }
.badge-gray    { background: var(--gray-200); color: var(--gray-700); }

/* === AVATAR === */
.avatar {
    width: 40px; height: 40px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--gray-200);
}
.avatar-sm { width: 32px; height: 32px; }
.avatar-lg { width: 48px; height: 48px; }

/* === LOADING SPINNER === */
.loading-spinner {
    width: 32px; height: 32px;
    border: 3px solid var(--gray-200);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.8s linear infinite; }

/* === MODAL OVERLAY === */
.pk-modal-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    align-items: center;
    justify-content: center;
}
.pk-modal-overlay.active { display: flex; }
.pk-modal-content {
    background: var(--surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    min-width: 360px;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
}
.pk-modal-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.pk-modal-body   { padding: 16px 20px; overflow-y: auto; }
.pk-modal-footer { padding: 12px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }

/* === CONTEXT MENU === */
.context-menu {
    position: fixed;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    z-index: 500;
    min-width: 180px;
    padding: 4px 0;
    display: none;
}
.context-menu.show { display: block; }
.context-menu-item {
    padding: 8px 14px;
    cursor: pointer;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.context-menu-item:hover { background: var(--gray-100); }

/* === SCROLLBAR === */
::-webkit-scrollbar        { width: 6px; height: 6px; }
::-webkit-scrollbar-track  { background: transparent; }
::-webkit-scrollbar-thumb  { background: var(--gray-300); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--gray-400); }
```

### Skeleton HTML (thêm vào `<body>` của `index.html`)

```html
<!-- ========== TOPBAR ========== -->
<header class="top-bar" role="banner">
    <div class="top-bar-left">
        <i data-lucide="shopping-cart" style="width:18px;height:18px;color:var(--primary);"></i>
        <span class="top-bar-title">TPOS</span>
        <div id="topbarTposSelectors" style="display:flex;gap:6px;align-items:center;flex:1;min-width:0;"></div>
        <div class="tpos-status-indicator" id="tposStatusIndicator" style="display:flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;background:var(--gray-100);color:var(--gray-600);">
            <span class="status-dot disconnected" style="width:6px;height:6px;border-radius:50%;background:var(--gray-400);"></span>
            <span class="status-text">Live</span>
        </div>
        <button class="btn-icon" id="btnTposRefresh" title="Refresh TPOS" style="width:28px;height:28px;">
            <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i>
        </button>
    </div>
    <div class="top-bar-divider"></div>
    <div class="top-bar-right">
        <i data-lucide="layout-grid" style="width:18px;height:18px;color:var(--pancake-color);"></i>
        <span class="top-bar-title">Pancake</span>
        <div id="topbarPancakeSelector" style="flex:1;min-width:0;"></div>
        <span id="serverModeIndicator" class="badge badge-gray">pancake</span>
        <button class="btn-icon" id="btnPancakeSettings" title="Cài đặt Pancake" style="width:28px;height:28px;">
            <i data-lucide="settings" style="width:14px;height:14px;"></i>
        </button>
        <button class="btn-icon" id="btnTposSettings" title="Cài đặt TPOS" style="width:28px;height:28px;">
            <i data-lucide="sliders" style="width:14px;height:14px;"></i>
        </button>
        <button class="btn-icon" id="btnColumnSettings" title="Column order" style="width:28px;height:28px;">
            <i data-lucide="columns" style="width:14px;height:14px;"></i>
        </button>
        <button class="btn-icon" id="btnRefresh" title="Refresh all" style="width:28px;height:28px;">
            <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i>
        </button>
    </div>
</header>

<!-- ========== DUAL COLUMN ========== -->
<section class="dual-column-section">
    <div class="dual-column-container" id="dualColumnContainer">
        <div class="column-wrapper" id="tposColumn" data-column="tpos">
            <div class="column-content" id="tposContent"></div>
        </div>
        <div class="resize-handle" id="resizeHandle" aria-label="Resize columns"></div>
        <div class="column-wrapper" id="pancakeColumn" data-column="pancake">
            <div class="column-content" id="pancakeContent"></div>
        </div>
    </div>
</section>

<!-- ========== SETTINGS PANEL (floating) ========== -->
<div class="settings-panel" id="settingsPanel">
    <div class="pk-modal-header">
        <h3 style="margin:0;font-size:14px;font-weight:700;">Thứ tự cột</h3>
        <button class="btn-icon" id="btnCloseSettings" style="width:28px;height:28px;">
            <i data-lucide="x" style="width:14px;height:14px;"></i>
        </button>
    </div>
    <div class="pk-modal-body">
        <label style="display:block;margin-bottom:8px;font-size:12px;color:var(--gray-600);">Cột 1</label>
        <select id="column1Select" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;margin-bottom:12px;">
            <option value="tpos">TPOS</option>
            <option value="pancake">Pancake</option>
        </select>
        <label style="display:block;margin-bottom:8px;font-size:12px;color:var(--gray-600);">Cột 2</label>
        <select id="column2Select" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;">
            <option value="pancake">Pancake</option>
            <option value="tpos">TPOS</option>
        </select>
    </div>
</div>

<!-- ========== MODALS (ẩn, toggle bằng .active) ========== -->
<div class="pk-modal-overlay" id="pancakeSettingsModal">
    <div class="pk-modal-content"><!-- nội dung phase 11 --></div>
</div>
<div class="pk-modal-overlay" id="tposSettingsModal">
    <div class="pk-modal-content"><!-- nội dung phase 4 --></div>
</div>
<div class="pk-modal-overlay" id="customerInfoModal">
    <div class="pk-modal-content"><!-- nội dung phase 10 --></div>
</div>

<!-- Script tags (sẽ thêm dần ở các phase sau) -->
<script>
    // Initialize lucide icons on first paint
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
</script>
```

### Verify
- Topbar hiển thị với icon + title 2 bên.
- 2 cột trắng trống, có line xám 8px ở giữa.
- Resize handle hover đổi màu, click+drag chưa làm gì (sẽ wire ở Phase 4).
- Lucide icons render thành SVG (không phải `<i>` trần).

---

Xong Phase 0-2. Tiếp sang [02-shared-and-layout.md](02-shared-and-layout.md) để xây shared services + ColumnManager (mới có resize thật sự hoạt động).
