#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — test render engine trang Zalo.
// =====================================================================
// Test REGRESSION cho engine chat Zalo (web2/zalo) — chạy LOCALHOST, KHÔNG cần
// tài khoản Zalo kết nối. Kiểm tra thuần render (WZChat.renderMessages mọi loại
// tin) + mount composer (mic/ghi âm) + form ZNS động + các method ZaloApi.
//
// Chạy:  node scripts/test-web2-zalo-render.js [--base http://localhost:8080] [--headed]
// Exit 0 = tất cả PASS; 1 = có FAIL (CI-friendly).
//
// KHÔNG gửi tin / không đụng tài khoản thật — chỉ gọi hàm render thuần + mount UI.
// =====================================================================

'use strict';

const path = require('path');
const { chromium } = require('playwright');
const { ensureLocalServer } = require('./lib/ensure-local-server');
const { restoreLoginSession } = require('./restore-login-session');

const args = process.argv.slice(2);
const getArg = (n, d) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? args[i + 1] : d;
};
const BASE = (getArg('base', 'http://localhost:8080') || '').replace(/\/$/, '');
const HEADED = args.includes('--headed');
const USER = getArg('user', 'admin');
const PASS = getArg('pass', 'admin@@');

const log = (...a) => console.log(...a);

// Bộ assertion chạy TRONG trang (thuần, đồng bộ) → trả {checks:{name:bool}, errs:[]}
function inPageSuite() {
    const out = {};
    const R = (msgs, conv) => window.WZChat.renderMessages(msgs, conv || { thread_type: 'user' });
    const T = Date.now();

    out.engineLoaded = !!(window.WZChat && window.ZaloApi && window.WZApp);

    // ── renderMessages: mọi loại bong bóng ──
    out.textBubble = /wz-msg-bubble/.test(
        R([{ msg_type: 'text', direction: 'in', sent_at: T, content: 'Xin chào', msg_id: 't1' }])
    );
    out.imageBubble = /wz-msg-media|wz-msg-grid/.test(
        R([
            {
                msg_type: 'image',
                direction: 'in',
                sent_at: T,
                msg_id: 'i1',
                attachments: [{ type: 'image', url: 'https://x/a.jpg', thumb: 'https://x/a.jpg' }],
            },
        ])
    );
    // link: card khi có metadata + fallback link gọn khi không
    out.linkCard = /wz-msg-linkcard/.test(
        R([
            {
                msg_type: 'link',
                direction: 'in',
                sent_at: T,
                msg_id: 'l1',
                content: 'SP hot',
                attachments: [
                    {
                        type: 'link',
                        href: 'https://shopee.vn/abc',
                        thumb: 'https://zdn.vn/t.jpg',
                        title: 'Áo thun',
                        desc: 'Giá tốt',
                    },
                ],
            },
        ])
    );
    const plainLink = R([
        {
            msg_type: 'link',
            direction: 'in',
            sent_at: T,
            msg_id: 'l2',
            content: 'https://x.io/a',
            attachments: [{ type: 'link', href: 'https://x.io/a' }],
        },
    ]);
    out.linkPlainFallback = /wz-msg-linkbox/.test(plainLink) && !/wz-msg-linkcard/.test(plainLink);
    out.videoPlayer = /wz-msg-video-player/.test(
        R([
            {
                msg_type: 'video',
                direction: 'in',
                sent_at: T,
                msg_id: 'v1',
                attachments: [{ type: 'video', url: 'https://x/v.mp4', thumb: 'https://x/t.jpg' }],
            },
        ])
    );
    out.voiceBubble = /wz-msg-voice/.test(
        R([
            {
                msg_type: 'voice',
                direction: 'out',
                sent_at: T,
                msg_id: 'vo1',
                attachments: [{ type: 'voice', url: 'blob:fake' }],
            },
        ])
    );
    const contact = R([
        {
            msg_type: 'contact',
            direction: 'in',
            sent_at: T,
            msg_id: 'c1',
            attachments: [{ type: 'contact', uid: 'u9', phone: '0901234567', title: 'Nguyễn A' }],
        },
    ]);
    out.contactCard =
        /wz-msg-contact/.test(contact) &&
        contact.indexOf('Nguyễn A') >= 0 &&
        contact.indexOf('0901234567') >= 0;
    const loc = R([
        {
            msg_type: 'location',
            direction: 'in',
            sent_at: T,
            msg_id: 'lo1',
            attachments: [
                {
                    type: 'location',
                    lat: '10.7',
                    lon: '106.7',
                    title: '123 Lê Lợi',
                    href: 'https://maps.google.com/?q=10.7,106.7',
                },
            ],
        },
    ]);
    out.locationCard = /wz-msg-location/.test(loc) && /maps\.google\.com/.test(loc);

    // ── tin hệ thống nhóm + tool xoá-phía-tôi + grouping ──
    const grp = R(
        [
            {
                msg_type: 'text',
                direction: 'in',
                sent_at: T,
                content: 'Hi',
                msg_id: 'g1',
                sender_uid: 'u1',
            },
            {
                msg_type: 'system',
                direction: 'system',
                sent_at: T,
                content: 'B đã tham gia nhóm',
                msg_id: 's1',
            },
            {
                msg_type: 'text',
                direction: 'in',
                sent_at: T,
                content: 'Tiếp',
                msg_id: 'g2',
                sender_uid: 'u2',
            },
        ],
        { thread_type: 'group' }
    );
    out.systemLine = /wz-sys-msg/.test(grp) && grp.indexOf('B đã tham gia nhóm') >= 0;
    out.systemNotBubble = !/wz-msg-bubble[^>]*>[^<]*B đã tham gia/.test(grp);
    out.bubblesAroundSystem = (grp.match(/wz-msg-bubble/g) || []).length === 2;
    out.deleteMeTool = (grp.match(/data-act="delete-me"/g) || []).length >= 2;

    // ── composer mount: mic + thanh ghi âm + nút phụ ──
    const tmp = document.createElement('div');
    document.body.appendChild(tmp);
    try {
        window.WZChat.mountComposer(tmp, {
            conv: { id: 1, thread_id: 't1', thread_type: 'user' },
            account: 'acc1',
            onSendText() {},
            onSendMedia() {},
            onSendFile() {},
            onSendSticker() {},
            onSendVoice() {},
        });
        out.composerMic = !!tmp.querySelector('[data-act=voice]');
        out.composerVoiceBar =
            !!tmp.querySelector('.wz-voicebar') &&
            tmp.querySelector('.wz-voicebar').hidden === true &&
            !!tmp.querySelector('.wz-voice-stop') &&
            !!tmp.querySelector('.wz-voice-cancel');
        out.composerQuick = !!tmp.querySelector('[data-act=quick]');
    } finally {
        tmp.remove();
    }

    // ── ZNS form động: inject template fake → render 3 ô ──
    try {
        const W = window.WZApp;
        W.state.zns.templates = [
            {
                template_id: 'TT',
                template_name: 'Test',
                params: [
                    { name: 'customer_name', require: true },
                    { name: 'order_code', require: true },
                    { name: 'amount', type: 'NUMBER' },
                ],
            },
        ];
        const sel = document.getElementById('wzZnsTemplate');
        sel.innerHTML = '<option value="TT">Test</option>';
        sel.value = 'TT';
        W.renderZnsFields();
        const fields = document.querySelectorAll('#wzZnsFields [data-zns-param]');
        out.znsDynamicForm =
            fields.length === 3 && fields[2].type === 'number' && fields[0].dataset.req === '1';
    } catch {
        out.znsDynamicForm = false;
    }

    // ── ZaloApi: method mới có mặt ──
    const A = window.ZaloApi || {};
    out.apiMethods =
        typeof A.addQuickReply === 'function' &&
        typeof A.deleteMessage === 'function' &&
        typeof A.pinConversation === 'function' &&
        typeof A.muteConversation === 'function' &&
        typeof A.markConversation === 'function';

    return out;
}

async function main() {
    await ensureLocalServer(BASE, path.join(__dirname, '..'));
    const browser = await chromium.launch({ headless: !HEADED });
    const errs = [];
    let failed = false;
    try {
        const ctx = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            bypassCSP: true,
        });
        // JS no-cache để luôn lấy bản mới nhất (route handler đã no-cache nhưng chắc ăn).
        await ctx.route('**/*.js', (route) =>
            route.continue({
                headers: { ...route.request().headers(), 'cache-control': 'no-cache, no-store' },
            })
        );
        // Khôi phục phiên đăng nhập từ secret file; fallback form-login nếu không có/đã hết hạn.
        const snap = await restoreLoginSession(ctx, { base: BASE }).catch(() => null);
        const page = await ctx.newPage();
        page.on('console', (m) => {
            if (m.type() === 'error') errs.push(m.text().slice(0, 200));
        });
        page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 200)));

        if (!snap) {
            await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
            if (await page.$('#username')) {
                await page.fill('#username', USER);
                await page.fill('#password', PASS);
                await page.locator('#password').press('Enter');
                await page.waitForTimeout(2500);
            }
        }

        log(`\n→ Mở trang Zalo (${BASE}/web2/zalo/index.html)…`);
        await page.goto(`${BASE}/web2/zalo/index.html?t=${Date.now()}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        });
        // Chờ engine chat + app sẵn sàng.
        await page.waitForFunction(
            () => window.WZChat && window.WZChat.renderMessages && window.WZApp && window.ZaloApi,
            { timeout: 20_000 }
        );

        const checks = await page.evaluate(inPageSuite);

        log('\n── KẾT QUẢ RENDER ENGINE ──');
        const names = Object.keys(checks);
        let pass = 0;
        for (const n of names) {
            const ok = checks[n] === true;
            if (ok) pass++;
            else failed = true;
            log(`  ${ok ? '✅' : '❌'}  ${n}`);
        }
        log(`\n  ${pass}/${names.length} PASS`);

        const realErrs = errs.filter(
            (e) => !/favicon|net::ERR|Failed to load resource|fetch/i.test(e)
        );
        if (realErrs.length) {
            failed = true;
            log(`\n  ❌ Console errors (${realErrs.length}):`);
            realErrs.slice(0, 10).forEach((e) => log('     • ' + e));
        } else {
            log('  ✅ Không có lỗi console (app)');
        }
    } finally {
        await browser.close();
    }
    log(failed ? '\n✗ FAIL\n' : '\n✓ ALL PASS\n');
    process.exit(failed ? 1 : 0);
}

main().catch((e) => {
    console.error('Test crashed:', e.message);
    process.exit(1);
});
