// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
//
// One-shot Playwright inspection of Pancake.vn's chat UI.
// Logs in via JWT cookie/localStorage (creds from serect_dont_push.txt),
// navigates to a conversation, then dumps:
//  - DOM structure of the message thread
//  - Computed CSS for scroll-related properties on the thread element
//  - Any scroll-easing CSS classes (smooth-scroll, momentum, etc.)
//  - localStorage / sessionStorage keys + sizes
//  - Service worker presence
//  - Sample frame perf during a wheel scroll
//
// Usage:
//   node scripts/pancake-chat-inspect.js

const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const SECRETS = fs.readFileSync(path.join(__dirname, '..', 'serect_dont_push.txt'), 'utf-8');
const JWT = SECRETS.match(/^PANCAKE_JWT:\s*(\S+)/m)?.[1];
const USER_UID = SECRETS.match(/^PANCAKE_USER_UID:\s*(\S+)/m)?.[1];
const SESSION_ID = SECRETS.match(/^PANCAKE_SESSION_ID:\s*(\S+)/m)?.[1];
const FB_ID = SECRETS.match(/^PANCAKE_FB_ID:\s*(\S+)/m)?.[1];

if (!JWT) {
    console.error('No PANCAKE_JWT in secrets file');
    process.exit(1);
}

const STORE_URL = 'https://pancake.vn/NhiJudyStore';
const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-session', 'pancake-inspect');
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        // Preload cookies / storage before first navigation by injecting into
        // the page context via an init script.
    });
    // Per secrets file note: "Browser cookie injection: ctx.addCookies([
    // {name:'jwt', value:$PANCAKE_JWT, domain:'.pancake.vn', path:'/'}])"
    await ctx.addCookies([
        {
            name: 'jwt',
            value: JWT,
            domain: '.pancake.vn',
            path: '/',
            httpOnly: false,
            secure: true,
            sameSite: 'Lax',
        },
        {
            name: 'access_token',
            value: JWT,
            domain: '.pancake.vn',
            path: '/',
            httpOnly: false,
            secure: true,
            sameSite: 'Lax',
        },
        { name: 'locale', value: 'vi', domain: '.pancake.vn', path: '/', sameSite: 'Lax' },
        { name: 'country', value: 'VN', domain: '.pancake.vn', path: '/', sameSite: 'Lax' },
    ]);
    // Inject the chat-widget session keys that Pancake's customer-facing
    // widget reads on load. Without these the widget opens a fresh anon
    // session instead of reattaching to ours.
    const CHAT_SESSION_JSON = SECRETS.match(
        /^PANCAKE_LS_PANCAKE_CHAT_SESSION_web_pancakeVN:\s*(.+)$/m
    )?.[1]?.trim();
    const SS_PKE_CLIENT_SESSION = SECRETS.match(
        /^PANCAKE_SS_pke_client_session:\s*(.+)$/m
    )?.[1]?.trim();
    await ctx.addInitScript(
        ({ jwt, uid, sid, fbId, chatSessionJson, ssClient }) => {
            try {
                localStorage.setItem('jwt', jwt);
                localStorage.setItem('access_token', jwt);
                localStorage.setItem('user_uid', uid);
                localStorage.setItem('session_id', sid);
                localStorage.setItem('fb_id', fbId);
                if (chatSessionJson) {
                    localStorage.setItem('PANCAKE_CHAT_SESSION_web_pancakeVN', chatSessionJson);
                }
                if (ssClient) {
                    sessionStorage.setItem('pke_client_session', ssClient);
                }
            } catch (_e) {
                /* ignore */
            }
        },
        {
            jwt: JWT,
            uid: USER_UID,
            sid: SESSION_ID,
            fbId: FB_ID,
            chatSessionJson: CHAT_SESSION_JSON,
            ssClient: SS_PKE_CLIENT_SESSION,
        }
    );

    const page = await ctx.newPage();
    console.log('[1/6] Navigating to', STORE_URL);
    await page.goto(STORE_URL, { waitUntil: 'networkidle', timeout: 45_000 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: path.join(OUT_DIR, '01-landing.png'), fullPage: false });

    // The customer-facing chat widget on the storefront is a floating
    // button. Click anything that looks like a chat trigger to open it.
    console.log('[2/6] Looking for chat widget trigger');
    const triggerInfo = await page.evaluate(() => {
        const candidates = Array.from(
            document.querySelectorAll(
                'iframe, [class*="chat"], [class*="Chat"], [id*="chat"], button[aria-label*="chat" i]'
            )
        );
        const visible = candidates.filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 20 && r.height > 20 && getComputedStyle(el).display !== 'none';
        });
        return {
            totalCandidates: candidates.length,
            visibleCount: visible.length,
            top5: visible.slice(0, 5).map((el) => ({
                tag: el.tagName,
                cls: (el.className?.toString() || '').slice(0, 100),
                rect: (() => {
                    const r = el.getBoundingClientRect();
                    return {
                        x: Math.round(r.x),
                        y: Math.round(r.y),
                        w: Math.round(r.width),
                        h: Math.round(r.height),
                    };
                })(),
                aria: el.getAttribute('aria-label'),
                isIframe: el.tagName === 'IFRAME',
                iframeSrc: el.tagName === 'IFRAME' ? el.src : null,
            })),
        };
    });
    console.log(JSON.stringify(triggerInfo, null, 2));

    // Click the first conversation row in the inbox sidebar
    await page.evaluate(() => {
        // Pancake admin uses generic class names; look for items in the
        // left sidebar that have a customer name + timestamp pattern.
        const rows = Array.from(document.querySelectorAll('div, li, a')).filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.x > 350) return false; // sidebar is on the left
            if (r.width < 200 || r.width > 400) return false;
            if (r.height < 50 || r.height > 120) return false;
            const txt = el.textContent || '';
            return /\d{1,2}:\d{2}/.test(txt) && txt.length > 20 && txt.length < 500;
        });
        rows[0]?.click();
    });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: path.join(OUT_DIR, '02-chat-opened.png'), fullPage: false });

    // 3. Inspect message thread DOM + CSS
    console.log('[3/6] Inspecting chat thread DOM/CSS');
    const threadInfo = await page.evaluate(() => {
        // Find the scrollable element with messages inside
        const all = Array.from(document.querySelectorAll('*'));
        const scrollable = all.filter((el) => {
            const cs = getComputedStyle(el);
            return (
                (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
                el.scrollHeight > el.clientHeight + 100
            );
        });
        const threadCandidate = scrollable
            .map((el) => ({
                el,
                msgs: el.querySelectorAll(
                    '[class*="message"], [class*="Message"], [class*="bubble"]'
                ).length,
                area: el.clientWidth * el.clientHeight,
            }))
            .filter((c) => c.msgs > 0)
            .sort((a, b) => b.msgs - a.msgs)[0];
        if (!threadCandidate) return { found: false, scrollableCount: scrollable.length };
        const t = threadCandidate.el;
        const cs = getComputedStyle(t);
        const firstChild = t.firstElementChild;
        const firstChildCS = firstChild ? getComputedStyle(firstChild) : null;
        const sampleMsg = t.querySelector(
            '[class*="message"], [class*="Message"], [class*="bubble"]'
        );
        const msgCS = sampleMsg ? getComputedStyle(sampleMsg) : null;
        return {
            found: true,
            tag: t.tagName,
            class: t.className?.toString().slice(0, 200),
            scrollHeight: t.scrollHeight,
            clientHeight: t.clientHeight,
            messageCount: threadCandidate.msgs,
            css: {
                overflowY: cs.overflowY,
                overscrollBehavior: cs.overscrollBehavior,
                scrollBehavior: cs.scrollBehavior,
                scrollbarGutter: cs.scrollbarGutter,
                contain: cs.contain,
                willChange: cs.willChange,
                transform: cs.transform,
                webkitOverflowScrolling:
                    cs['-webkit-overflow-scrolling'] || cs.webkitOverflowScrolling,
            },
            firstChildCss: firstChildCS
                ? {
                      display: firstChildCS.display,
                      flexDirection: firstChildCS.flexDirection,
                      contain: firstChildCS.contain,
                      contentVisibility: firstChildCS.contentVisibility,
                  }
                : null,
            sampleMessageCss: msgCS
                ? {
                      contain: msgCS.contain,
                      contentVisibility: msgCS.contentVisibility,
                      contentIntrinsicSize: msgCS.containIntrinsicSize,
                      willChange: msgCS.willChange,
                      transform: msgCS.transform,
                      transition: msgCS.transition,
                      animation: msgCS.animation,
                  }
                : null,
        };
    });
    console.log(JSON.stringify(threadInfo, null, 2));

    // 4. Look for known smooth-scroll libraries on window
    console.log('[4/6] Checking for smooth-scroll globals');
    const libs = await page.evaluate(() => {
        return {
            hasLenis: typeof window.Lenis === 'function' || !!window.lenis,
            hasGsap: typeof window.gsap !== 'undefined',
            hasScrollTrigger: typeof window.ScrollTrigger !== 'undefined',
            hasLocomotive:
                typeof window.LocomotiveScroll !== 'undefined' ||
                typeof window.locomotive !== 'undefined',
            hasIScroll: typeof window.IScroll !== 'undefined',
            hasSmoothScrollbar: typeof window.Scrollbar !== 'undefined',
            hasFramerMotion: typeof window.framerMotion !== 'undefined',
            scriptsCount: document.scripts.length,
            scriptSrcsSample: Array.from(document.scripts)
                .map((s) => s.src)
                .filter(Boolean)
                .filter((s) => /scroll|lenis|gsap|locomotive|motion|swiper|animate/i.test(s))
                .slice(0, 20),
        };
    });
    console.log(JSON.stringify(libs, null, 2));

    // 5. localStorage + sessionStorage keys/sizes
    console.log('[5/6] Storage inventory');
    const storage = await page.evaluate(() => {
        const sum = (obj) => {
            let total = 0;
            const items = [];
            for (let i = 0; i < obj.length; i++) {
                const key = obj.key(i);
                const val = obj.getItem(key) || '';
                total += key.length + val.length;
                items.push({ key, len: val.length, preview: val.slice(0, 80) });
            }
            return { total, items: items.sort((a, b) => b.len - a.len).slice(0, 20) };
        };
        return {
            localStorage: sum(localStorage),
            sessionStorage: sum(sessionStorage),
            hasServiceWorker: !!navigator.serviceWorker?.controller,
            indexedDBs: indexedDB.databases ? '(supported)' : '(unsupported)',
        };
    });
    console.log(JSON.stringify(storage, null, 2));

    // Optional: list IndexedDB databases
    try {
        const dbs = await page.evaluate(async () => {
            const list = await indexedDB.databases?.();
            return list?.map((d) => ({ name: d.name, version: d.version })) || [];
        });
        console.log('IndexedDBs:', JSON.stringify(dbs));
    } catch (_e) {
        /* older browsers */
    }

    // 6. Measure scroll frame perf
    console.log('[6/6] Measuring scroll perf (wheel +800 x 3)');
    const perf = await page.evaluate(async () => {
        const all = Array.from(document.querySelectorAll('*'));
        const scrollable = all.filter((el) => {
            const cs = getComputedStyle(el);
            return (
                (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
                el.scrollHeight > el.clientHeight + 100
            );
        });
        const t = scrollable
            .map((el) => ({
                el,
                msgs: el.querySelectorAll('[class*="message"], [class*="bubble"]').length,
            }))
            .filter((c) => c.msgs > 0)
            .sort((a, b) => b.msgs - a.msgs)[0]?.el;
        if (!t) return { err: 'no thread' };
        t.scrollTop = t.scrollHeight;
        await new Promise((r) => setTimeout(r, 500));
        const frames = [];
        let last = performance.now();
        let raf = 0;
        await new Promise((resolve) => {
            const tick = () => {
                const now = performance.now();
                frames.push(now - last);
                last = now;
                raf++;
                if (raf % 8 === 0) {
                    t.dispatchEvent(
                        new WheelEvent('wheel', {
                            deltaY: -250,
                            deltaMode: 0,
                            bubbles: true,
                            cancelable: true,
                        })
                    );
                }
                if (raf >= 60) {
                    resolve();
                    return;
                }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
        const sorted = frames.slice(2).sort((a, b) => b - a);
        return {
            framesMeasured: frames.length,
            avgMs: +(frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(1),
            worstMs: +sorted[0].toFixed(1),
            p95Ms: +sorted[Math.floor(sorted.length * 0.05)].toFixed(1),
            scrollTopBefore: t.scrollHeight,
            scrollTopAfter: t.scrollTop,
        };
    });
    console.log(JSON.stringify(perf, null, 2));

    await page.screenshot({ path: path.join(OUT_DIR, '03-after-scroll.png'), fullPage: false });

    // Stay open briefly for user inspection
    console.log('\n✓ Inspection done. Reports in', OUT_DIR);
    console.log('Browser staying open 15s for manual look…');
    await page.waitForTimeout(15000);
    await browser.close();
})().catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
});
