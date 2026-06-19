// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — reusable chat modal CSS injector (_ensureChatModalCss). MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // Inject reusable chat styles on first render
    NO._ensureChatModalCss = function _ensureChatModalCss() {
        if (document.getElementById('w2-chat-modal-css')) return;
        const css = `
            .w2-chat-tool {
                width: 30px; height: 30px; border-radius: 6px; border: 1px solid #e2e8f0;
                background: #fff; cursor: pointer; color: #64748b;
                display: inline-flex; align-items: center; justify-content: center;
                transition: all 0.15s ease;
            }
            .w2-chat-tool:hover { background: #f1f5f9; color: #0f172a; border-color: #cbd5e1; }
            .w2-chat-phone { cursor: pointer; user-select: none; transition: color 0.15s; }
            .w2-chat-phone:hover { color: #0068ff; }

            /* Thread container — keep native scroll behaviour. Inspected
               Pancake.vn's own admin inbox (rc-virtual-list backed) and they
               run plain overflow:auto with zero containment, zero smooth-
               scroll lib, zero content-visibility. Native scroll on a
               small DOM (~25–60 bubbles) lands at 60 FPS without any of
               those, and the previous heavier rules were actually causing
               the "không mượt mắt nhìn" feel (content-visibility's
               measure-as-you-scroll, contain: paint repaint scope, etc.).
               scroll-behavior: smooth only applies to programmatic
               scrollTo()/scrollIntoView() so it does not slow wheel input. */
            #msgThread { scroll-behavior: smooth; }
            .w2-chat-row { flex-shrink: 0; }

            .w2-chat-bubble {
                box-shadow: 0 1px 2px rgba(15,23,42,0.06);
                line-height: 1.42;
                word-break: break-word;
            }

            /* ─── INBOX 3-COL SHELL — Pancake palette ─────────────
               Tokens captured live from pancake.vn admin inbox:
                 font-family   Roboto, Helvetica, Arial, sans-serif
                 body          14px / #1d2939 on #fff
                 conv-row      86px tall, unread bg #dde1e7
                 search input  14px, transparent inside #f5f6f8 capsule
                 filter btn    #eaecf0 bg, #344054 text, 32px height
                 chat header   68px, white, border-bottom 1px #ddd
                 incoming bub  #fff, radius 12 12 12 4
                 outgoing bub  #dcf8c6 (light-green), radius 12px
                 day separator centered pill
            */
            .w2-inbox-card {
                background: #fff;
                font-family: Roboto, Helvetica, Arial, sans-serif;
                color: #1d2939;
                font-size: 14px;
            }
            .w2-inbox-grid {
                flex: 1;
                display: grid;
                grid-template-columns: 320px 1fr 380px;
                min-height: 0;
            }
            .w2-inbox-sidebar {
                border-right: 1px solid #dddddd;
                display: flex;
                flex-direction: column;
                min-height: 0;
                background: #fff;
            }
            .w2-inbox-sb-head {
                padding: 12px;
                border-bottom: 1px solid #dddddd;
                display: flex;
                gap: 8px;
                align-items: center;
                flex-shrink: 0;
                background: #fff;
            }
            .w2-inbox-sb-search {
                flex: 1;
                display: flex;
                align-items: center;
                gap: 6px;
                background: #f5f6f8;
                border: 1px solid #e6e8ed;
                border-radius: 6px;
                padding: 0 10px;
                height: 32px;
                box-sizing: border-box;
            }
            .w2-inbox-sb-search input {
                flex: 1;
                background: transparent;
                border: 0;
                outline: 0;
                font-size: 14px;
                color: #1d2939;
                min-width: 0;
                font-family: inherit;
                height: 100%;
            }
            .w2-inbox-sb-search input::placeholder { color: #98a2b3; }
            .w2-inbox-sb-filter {
                border: 0;
                background: #eaecf0;
                color: #344054;
                font-size: 14px;
                font-weight: 500;
                padding: 0 12px;
                height: 32px;
                border-radius: 6px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 5px;
                flex-shrink: 0;
                font-family: inherit;
            }
            .w2-inbox-sb-filter:hover { background: #dfe2e7; color: #1d2939; }
            .w2-inbox-sb-filter.is-active {
                background: #e8f2ff;
                color: #0058da;
                font-weight: 600;
            }
            .w2-inbox-sb-filter-count {
                background: #0068ff;
                color: #fff;
                font-size: 11px;
                font-weight: 700;
                min-width: 16px;
                height: 16px;
                padding: 0 5px;
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .w2-inbox-sb-filter-count[hidden] { display: none; }
            .w2-inbox-sb-filter-wrap { position: relative; flex-shrink: 0; }
            /* Pancake-style 2-column filter popover — anchored to the
               filter button. Pancake floats the popup to the right of
               the sidebar so it doesn't get clipped; we mirror that by
               anchoring left: 0 of the button (popup extends rightward
               into the chat area). */
            .w2-fm-pancake {
                position: absolute;
                top: calc(100% + 6px);
                left: 0;
                background: #fff;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
                z-index: 30;
                display: flex;
                min-width: 540px;
                max-width: 640px;
                overflow: hidden;
            }
            .w2-fm-pancake[hidden] { display: none; }
            .w2-fm-col-cats {
                width: 240px;
                flex-shrink: 0;
                padding: 6px 4px;
                background: #fafafa;
                border-right: 1px solid #eef2f6;
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .w2-fm-col-sub {
                flex: 1;
                min-width: 280px;
                max-height: 420px;
                display: flex;
                flex-direction: column;
                background: #fff;
            }
            .w2-fm-section {
                padding: 8px 10px 4px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: #94a3b8;
            }
            .w2-fm-divider {
                height: 1px;
                background: #e2e8f0;
                margin: 4px 6px;
            }
            .w2-fm-cat {
                border: 0;
                background: transparent;
                text-align: left;
                padding: 9px 10px;
                font-size: 13px;
                font-family: inherit;
                color: #1d2939;
                cursor: pointer;
                border-radius: 6px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .w2-fm-cat:hover { background: #eef2f6; }
            .w2-fm-cat.is-active { background: #e8f2ff; color: #0058da; font-weight: 600; }
            .w2-fm-cat-label { flex: 1; }
            .w2-fm-cat-count {
                background: #e0e7ff;
                color: #0058da;
                font-size: 10px;
                font-weight: 700;
                padding: 1px 6px;
                border-radius: 999px;
                min-width: 18px;
                text-align: center;
            }
            .w2-fm-cat-count:empty { display: none; }
            .w2-fm-reset {
                border: 0;
                background: transparent;
                text-align: left;
                padding: 8px 10px;
                font-size: 12px;
                font-family: inherit;
                color: #64748b;
                cursor: pointer;
                border-radius: 6px;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .w2-fm-reset:hover { background: #f1f5f9; color: #1d2939; }
            .w2-fm-sub-search {
                padding: 10px;
                border-bottom: 1px solid #eef2f6;
                position: relative;
            }
            .w2-fm-sub-search input {
                width: 100%;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 6px 10px 6px 28px;
                font-size: 12px;
                font-family: inherit;
                outline: none;
                background: #fff;
            }
            .w2-fm-sub-search input:focus { border-color: #bcdcff; box-shadow: 0 0 0 3px rgba(0, 104, 255, 0.12); }
            .w2-fm-sub-search-icon {
                position: absolute;
                left: 18px;
                top: 50%;
                transform: translateY(-50%);
                color: #94a3b8;
                pointer-events: none;
            }
            .w2-fm-sub-list {
                flex: 1;
                overflow-y: auto;
                padding: 4px 6px;
            }
            .w2-fm-sub-empty {
                padding: 24px 12px;
                font-size: 12px;
                color: #94a3b8;
                text-align: center;
                font-style: italic;
            }
            .w2-fm-row {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 8px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            }
            .w2-fm-row:hover { background: #f8fafc; }
            .w2-fm-row input[type="checkbox"] {
                width: 14px;
                height: 14px;
                accent-color: #0068ff;
                cursor: pointer;
            }
            .w2-fm-tag-chip {
                display: inline-block;
                padding: 3px 10px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 600;
                color: #fff;
                line-height: 1.4;
            }
            .w2-fm-tag-chip-empty {
                background: transparent;
                color: #64748b;
                border: 1px dashed #cbd5e1;
            }
            .w2-fm-sub-placeholder {
                padding: 60px 16px;
                color: #94a3b8;
                font-size: 12px;
                text-align: center;
                font-style: italic;
            }
            .w2-inbox-sb-list {
                flex: 1;
                min-height: 0;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 0;
                background: #fff;
            }
            .w2-inbox-sb-empty { padding: 6px 0; }
            .w2-inbox-conv {
                display: flex;
                gap: 10px;
                padding: 12px;
                cursor: pointer;
                position: relative;
                background: #fff;
                transition: background 0.12s ease;
                min-height: 86px;
                box-sizing: border-box;
                align-items: center;
            }
            .w2-inbox-conv:hover { background: #f5f6f8; }
            .w2-inbox-conv.is-active { background: #e6f7ff; }
            .w2-inbox-conv.is-active:hover { background: #d3efff; }
            .w2-inbox-conv.is-unread { background: #dde1e7; }
            .w2-inbox-conv.is-unread:hover { background: #d2d7df; }
            .w2-inbox-conv.is-unread .w2-inbox-conv-name { font-weight: 600; }
            .w2-inbox-conv.is-unread .w2-inbox-conv-preview { color: #1d2939; font-weight: 500; }
            .w2-inbox-conv-avatar {
                width: 48px; height: 48px;
                border-radius: 50%;
                object-fit: cover;
                flex-shrink: 0;
                background: #e6e8ed;
            }
            .w2-inbox-conv-body { flex: 1; min-width: 0; }
            .w2-inbox-conv-top {
                display: flex; align-items: center; justify-content: space-between;
                font-size: 14px; font-weight: 400; color: #1d2939;
                margin-bottom: 4px;
                gap: 6px;
            }
            .w2-inbox-conv-name {
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                min-width: 0;
            }
            .w2-inbox-conv-time { font-size: 12px; color: #98a2b3; font-weight: 400; flex-shrink: 0; }
            .w2-inbox-conv-preview {
                font-size: 13px; color: #667085;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                line-height: 1.35;
            }
            .w2-inbox-conv-badge {
                position: absolute;
                top: 14px; right: 14px;
                width: 8px; height: 8px;
                border-radius: 50%;
                background: #f04438;
            }

            /* ─── INBOX CENTRE (chat panel) — Pancake palette ───── */
            .w2-inbox-center {
                display: flex;
                flex-direction: column;
                min-height: 0;
                background: #ebebeb; /* Pancake's chat-area neutral gray */
            }
            .w2-inbox-header {
                padding: 4px 12px 6px;
                border-bottom: 1px solid #dddddd;
                display: flex;
                align-items: center;
                gap: 10px;
                background: #ffffff;
                flex-shrink: 0;
                height: 68px;
                box-sizing: border-box;
            }
            .w2-inbox-icon-btn {
                width: 30px; height: 30px;
                border: 1px solid #e2e8f0;
                background: #fff;
                color: #475569;
                cursor: pointer;
                border-radius: 6px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: all 0.15s ease;
            }
            .w2-inbox-icon-btn:hover { background: #f1f5f9; color: #0f172a; border-color: #cbd5e1; }
            .w2-inbox-tabs {
                display: flex;
                border-bottom: 1px solid #e5e7eb;
                background: #fff;
                padding: 0 12px;
                flex-shrink: 0;
            }
            .interactions-tab {
                padding: 10px 16px;
                border: none;
                background: transparent;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                color: #64748b;
                border-bottom: 3px solid transparent;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                margin-bottom: -1px;
            }
            .interactions-tab.is-active { color: #0068ff; border-bottom-color: #0068ff; }
            .w2-inbox-tab-badge {
                background: #cbd5e1;
                color: #fff;
                padding: 1px 7px;
                border-radius: 9px;
                font-size: 10px;
                font-weight: 700;
                min-width: 18px;
                text-align: center;
            }
            .w2-inbox-tab-badge.is-active { background: #0068ff; }

            /* ─── INBOX RIGHT PANEL ─────────────────────────────── */
            .w2-inbox-right {
                border-left: 1px solid #e5e7eb;
                display: flex;
                flex-direction: column;
                min-height: 0;
                background: #fff;
            }
            .w2-inbox-right-tabs {
                display: flex;
                border-bottom: 1px solid #e5e7eb;
                background: #fff;
                padding: 0 16px;
                flex-shrink: 0;
            }
            .w2-inbox-right-tab {
                padding: 12px 14px;
                background: transparent;
                border: none;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                color: #64748b;
                border-bottom: 3px solid transparent;
                margin-bottom: -1px;
            }
            .w2-inbox-right-tab.is-active { color: #0068ff; border-bottom-color: #0068ff; }
            .w2-inbox-right-body {
                flex: 1;
                min-height: 0;
                overflow-y: auto;
                padding: 4px 0 80px;
                background: #fff;
            }
            .w2-section {
                padding: 12px 16px;
                border-bottom: 1px solid #f1f5f9;
            }
            .w2-section-title {
                font-size: 11px;
                font-weight: 700;
                color: #475569;
                text-transform: uppercase;
                letter-spacing: 0.4px;
                display: inline-flex;
                align-items: center;
                gap: 5px;
            }
            .w2-section-title-row {
                display: flex; align-items: center; justify-content: space-between;
                margin-bottom: 8px;
            }
            .w2-section-action {
                font-size: 11px; color: #0068ff; text-decoration: none; font-weight: 600;
            }
            .w2-section-action:hover { text-decoration: underline; }
            .w2-info-row {
                display: flex; gap: 10px; font-size: 12px;
                padding: 4px 0;
                color: #0f172a;
            }
            .w2-info-label { width: 72px; color: #64748b; flex-shrink: 0; }
            .w2-info-val { flex: 1; min-width: 0; word-break: break-word; }
            .w2-info-note {
                width: 100%; box-sizing: border-box;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 6px 8px;
                font-size: 12px;
                font-family: inherit;
                resize: vertical;
                margin-top: 6px;
            }
            .w2-input {
                width: 100%; box-sizing: border-box;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 7px 9px;
                font-size: 12px;
                color: #0f172a;
                outline: 0;
                font-family: inherit;
            }
            .w2-input:focus { border-color: #0068ff; box-shadow: 0 0 0 3px rgba(0, 104, 255,0.1); }
            .w2-form-row { margin-top: 6px; }
            .w2-form-row-2col {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px;
            }
            .w2-select-trigger {
                width: 100%; box-sizing: border-box;
                background: #fff;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 7px 9px;
                font-size: 12px;
                color: #94a3b8;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-top: 6px;
            }
            .w2-customer-card {
                margin-top: 10px;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 10px;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                cursor: pointer;
            }
            .w2-customer-card-avatar {
                width: 32px; height: 32px;
                border-radius: 50%;
                background: linear-gradient(135deg, #0068ff 0%, #2a96ff 100%);
                color: #fff;
                font-size: 13px;
                font-weight: 700;
                display: flex; align-items: center; justify-content: center;
                flex-shrink: 0;
            }
            .w2-line-table-head {
                display: flex; gap: 6px;
                font-size: 10px; color: #64748b;
                text-transform: uppercase; letter-spacing: 0.3px;
                font-weight: 700;
                padding: 6px 0;
                border-bottom: 1px solid #e2e8f0;
            }
            .w2-line-table-body { min-height: 80px; padding: 8px 0; }
            .w2-line-empty {
                text-align: center;
                color: #94a3b8;
                font-size: 12px;
                padding: 24px 0;
            }
            .w2-product-add {
                display: flex; gap: 6px;
                margin-top: 6px;
            }
            .w2-product-search {
                flex: 1; display: flex; align-items: center; gap: 6px;
                background: #f1f5f9;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 6px 9px;
            }
            .w2-product-search input {
                flex: 1; background: transparent; border: 0; outline: 0;
                font-size: 12px;
            }
            .w2-btn {
                border: 1px solid #e2e8f0; background: #fff; color: #475569;
                font-size: 12px; font-weight: 600;
                padding: 6px 12px; border-radius: 6px;
                cursor: pointer;
                display: inline-flex; align-items: center; gap: 4px;
            }
            .w2-btn-light:hover { background: #f1f5f9; }
            .w2-btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }
            .w2-btn-primary:hover { background: #1d4ed8; }
            .w2-btn-primary-lg {
                background: #2563eb; color: #fff; border-color: #2563eb;
                font-size: 13px; padding: 8px 16px;
            }
            .w2-btn-primary-lg:hover { background: #1d4ed8; }
            .w2-checkbox {
                display: inline-flex; align-items: center; gap: 5px;
                font-size: 12px; cursor: pointer; user-select: none;
            }
            .w2-totals {
                margin-top: 10px;
                display: flex; flex-direction: column; gap: 4px;
            }
            .w2-total-row {
                display: flex; justify-content: space-between;
                font-size: 12px; color: #475569;
            }
            .w2-total-row strong { color: #0f172a; }
            .w2-inbox-right-foot {
                position: absolute;
                bottom: 0; left: 0; right: 0;
                padding: 10px 16px;
                background: #fff;
                border-top: 1px solid #e5e7eb;
                display: flex; align-items: center; justify-content: space-between;
                font-size: 14px;
            }

            /* ─── QUICK REPLY TAG ROW ───────────────────────────── */
            .w2-quick-reply-row {
                display: flex; flex-wrap: wrap; gap: 3px;
                padding: 6px 10px;
                background: #fff;
                border-top: 1px solid #f1f5f9;
                flex-shrink: 0;
            }
            .w2-quick-tag {
                color: #fff;
                font-size: 10px;
                font-weight: 600;
                padding: 3px 9px;
                border-radius: 3px;
                border: 0;
                cursor: pointer;
                text-shadow: 0 1px 1px rgba(0,0,0,0.15);
                line-height: 1.2;
            }
            .w2-quick-tag:hover { filter: brightness(0.92); }

            /* Make the right panel scroll container relative so the
               sticky footer (.w2-inbox-right-foot) can anchor inside it. */
            .w2-inbox-right { position: relative; }

            /* Skeleton bubbles shown while Pancake API is in flight */
            .w2-chat-skeleton-bubble {
                background: linear-gradient(90deg, #eef2f7 0%, #f8fafc 50%, #eef2f7 100%);
                background-size: 200% 100%;
                animation: w2ChatShimmer 1.2s linear infinite;
            }
            @keyframes w2ChatShimmer {
                0%   { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
            .w2-chat-bubble img { display: block; }
            .w2-chat-bubble audio { width: 240px; }

            /* Quoted reply preview inside bubble */
            .w2-chat-quoted {
                background: rgba(0,0,0,0.06);
                border-left: 3px solid rgba(255,255,255,0.55);
                padding: 5px 8px;
                border-radius: 6px;
                margin-bottom: 5px;
                opacity: 0.92;
            }
            .w2-chat-row.is-in .w2-chat-quoted {
                border-left-color: #0068ff;
                background: #f1f5f9;
            }
            .w2-chat-quoted-from {
                font-size: 10px;
                font-weight: 700;
                margin-bottom: 2px;
                opacity: 0.85;
            }

            /* Floating reactions strip below bubble */
            .w2-chat-reactions {
                display: inline-flex;
                gap: 2px;
                background: #fff;
                border: 1px solid #e5e7eb;
                border-radius: 999px;
                padding: 1px 6px;
                margin-top: -8px;
                margin-bottom: 2px;
                box-shadow: 0 2px 6px rgba(15,23,42,0.1);
                font-size: 12px;
                z-index: 2;
                align-self: flex-end;
            }
            .w2-chat-row.is-in .w2-chat-reactions { align-self: flex-start; }

            /* Hover reply button */
            .w2-chat-reply-btn {
                opacity: 0;
                width: 22px; height: 22px;
                background: #fff;
                border: 1px solid #e2e8f0;
                border-radius: 50%;
                color: #64748b;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: opacity 0.15s, color 0.15s, background 0.15s;
                flex-shrink: 0;
            }
            .w2-chat-row:hover .w2-chat-reply-btn { opacity: 1; }
            .w2-chat-reply-btn:hover { background: #e8f2ff; color: #0068ff; }

            /* "Replying to X" bar above input */
            .w2-chat-reply-bar {
                display: flex;
                align-items: center;
                gap: 8px;
                background: #f1f5f9;
                border-left: 3px solid #0068ff;
                padding: 6px 10px;
                border-radius: 6px;
                margin-bottom: 6px;
                font-size: 12px;
                color: #475569;
            }
            .w2-chat-reply-bar .preview {
                flex: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .w2-chat-reply-bar .preview strong { color: #0068ff; margin-right: 6px; }
            .w2-chat-reply-bar button {
                width: 22px; height: 22px;
                background: transparent;
                border: 0;
                cursor: pointer;
                color: #94a3b8;
                font-size: 16px;
                line-height: 1;
            }
            .w2-chat-reply-bar button:hover { color: #b91c1c; }

            /* Highlighted message when being replied to */
            .w2-chat-row.is-replying-target .w2-chat-bubble {
                outline: 2px solid #fbbf24;
                outline-offset: 2px;
                animation: w2ChatHighlight 0.7s ease-in-out;
            }
            @keyframes w2ChatHighlight {
                0%, 100% { outline-color: #fbbf24; }
                50%      { outline-color: #f59e0b; }
            }

            #orderInteractionsModal .w2p-card { background:#fff; }
            #msgInput:focus {
                outline: none;
                border-color: #0068ff !important;
                box-shadow: 0 0 0 3px rgba(0, 104, 255,0.12);
            }
        `;
        const el = document.createElement('style');
        el.id = 'w2-chat-modal-css';
        el.textContent = css;
        document.head.appendChild(el);
    };
})();
