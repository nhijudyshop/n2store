#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// TIKREEL AUTHENTICATED UI STUDY — Connects to user's running Chromium via CDP
// (port 9444, same one our smoke scripts use), then navigates the logged-in
// tikreel.net/app surface to capture screenshots, design tokens, button styles,
// motion patterns, and component anatomy. Output → downloads/tikreel-ui-study/.
//
// Usage: node scripts/tikreel-ui-study-authenticated.js
//   Optional: PORT=9444 to override.
// =====================================================

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 9444;
const OUT_DIR = path.resolve(__dirname, '..', 'downloads', 'tikreel-ui-study');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Pages to visit inside /app. We intentionally avoid POSTing or destructive
// clicks — read-only study only.
const APP_PATHS = [
    '/app', // dashboard
    '/app/library', // clip library
    '/app/models', // models list
    '/app/products', // products
    '/app/bulk', // bulk generator
    '/app/campaigns', // saved campaigns
    '/app/history', // outputs / history
    '/app/settings', // settings
    '/pricing', // packs
];

const VIEWPORTS = [
    { width: 1440, height: 900, name: 'desktop' },
    { width: 375, height: 812, name: 'mobile' },
];

function safeName(p) {
    return p.replace(/^\//, '').replace(/\//g, '_') || 'root';
}

(async () => {
    console.log(`[study-auth] connecting to CDP at http://localhost:${PORT}`);
    const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
    const ctxs = browser.contexts();
    const ctx = ctxs[0] || (await browser.newContext());
    console.log(`  connected — ${ctx.pages().length} existing page(s)`);

    // Pick or create our worker page (don't disturb user's existing tabs).
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.warn('  pageerror:', e.message));

    const allTokens = {};

    for (const p of APP_PATHS) {
        const url = `https://www.tikreel.net${p}`;
        console.log(`\n[study-auth] === ${p} ===`);
        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 35000 });
        } catch (e) {
            console.warn(`  goto failed: ${e.message}`);
            continue;
        }
        // Tikreel is a Next.js client-rendered app — wait a bit for hydration.
        await page.waitForTimeout(3500);
        const finalUrl = page.url();
        console.log(`  final URL: ${finalUrl}`);
        if (finalUrl.includes('/login')) {
            console.warn(`  ⚠ redirected to login — session cookie may not be live for this path`);
        }

        const tokens = await page.evaluate(() => {
            function pickComputed(el, props) {
                const cs = getComputedStyle(el);
                const out = {};
                for (const p of props) out[p] = cs.getPropertyValue(p).trim();
                return out;
            }
            const body = document.body;
            const bodyTokens = pickComputed(body, [
                'background-color',
                'color',
                'font-family',
                'font-size',
                'line-height',
            ]);

            // Canonical button + card sampling.
            const buttons = Array.from(document.querySelectorAll('button, a[role="button"]'));
            const seen = new Set();
            const btnSamples = [];
            for (const b of buttons) {
                const cs = getComputedStyle(b);
                const key =
                    cs.backgroundColor +
                    '|' +
                    cs.color +
                    '|' +
                    cs.borderRadius +
                    '|' +
                    cs.fontWeight;
                if (seen.has(key) || b.offsetWidth < 40) continue;
                seen.add(key);
                btnSamples.push({
                    text: b.textContent.trim().slice(0, 60),
                    bg: cs.backgroundColor,
                    color: cs.color,
                    border: cs.border,
                    borderRadius: cs.borderRadius,
                    padding: cs.padding,
                    fontSize: cs.fontSize,
                    fontWeight: cs.fontWeight,
                    boxShadow: cs.boxShadow.slice(0, 120),
                    transition: cs.transition.slice(0, 120),
                });
                if (btnSamples.length >= 12) break;
            }

            // Sidebar / nav / hero anatomy hint.
            const navs = Array.from(document.querySelectorAll('nav, aside, [role="navigation"]'));
            const navSamples = navs.slice(0, 3).map((n) => {
                const cs = getComputedStyle(n);
                return {
                    tag: n.tagName,
                    cls: (n.className || '').toString().slice(0, 120),
                    bg: cs.backgroundColor,
                    width: n.offsetWidth,
                    height: n.offsetHeight,
                    items: n.querySelectorAll('a, button').length,
                };
            });

            const headings = ['h1', 'h2', 'h3'].map((tag) => {
                const el = document.querySelector(tag);
                if (!el) return { tag, missing: true };
                const cs = getComputedStyle(el);
                return {
                    tag,
                    text: el.textContent.trim().slice(0, 80),
                    fontSize: cs.fontSize,
                    fontWeight: cs.fontWeight,
                    lineHeight: cs.lineHeight,
                    letterSpacing: cs.letterSpacing,
                    color: cs.color,
                };
            });

            // Capture custom-property design system on :root.
            const rootStyle = getComputedStyle(document.documentElement);
            const cssVars = {};
            for (let i = 0; i < rootStyle.length; i++) {
                const name = rootStyle[i];
                if (!name.startsWith('--')) continue;
                cssVars[name] = rootStyle.getPropertyValue(name).trim();
            }

            // Gradients / glow effects.
            const allEls = Array.from(document.querySelectorAll('*')).slice(0, 800);
            const gradientUses = [];
            const seenG = new Set();
            for (const el of allEls) {
                const cs = getComputedStyle(el);
                const bg = cs.backgroundImage;
                if (bg && bg.includes('gradient') && !seenG.has(bg)) {
                    seenG.add(bg);
                    gradientUses.push({
                        sel: el.tagName + (el.id ? '#' + el.id : ''),
                        cls: (el.className || '').toString().slice(0, 80),
                        bg: bg.slice(0, 200),
                    });
                    if (gradientUses.length >= 8) break;
                }
            }

            // Cards (anything that looks card-shaped: rounded + bg + padding).
            const cardCandidates = Array.from(
                document.querySelectorAll('[class*="card"], [class*="Card"], section, article')
            );
            const seenC = new Set();
            const cardSamples = [];
            for (const c of cardCandidates) {
                const cs = getComputedStyle(c);
                if (cs.borderRadius === '0px' || cs.backgroundColor === 'rgba(0, 0, 0, 0)')
                    continue;
                const key = cs.backgroundColor + '|' + cs.borderRadius + '|' + cs.boxShadow;
                if (seenC.has(key)) continue;
                seenC.add(key);
                cardSamples.push({
                    tag: c.tagName,
                    cls: (c.className || '').toString().slice(0, 100),
                    bg: cs.backgroundColor,
                    border: cs.border,
                    borderRadius: cs.borderRadius,
                    boxShadow: cs.boxShadow.slice(0, 140),
                    padding: cs.padding,
                });
                if (cardSamples.length >= 6) break;
            }

            return {
                bodyTokens,
                btnSamples,
                headings,
                navSamples,
                gradientUses,
                cardSamples,
                cssVars,
            };
        });

        allTokens[p] = { url: finalUrl, ...tokens };

        // Screenshots both viewports.
        for (const v of VIEWPORTS) {
            await page.setViewportSize({ width: v.width, height: v.height });
            await page.waitForTimeout(800);
            const file = path.join(OUT_DIR, `auth-${safeName(p)}-${v.name}.png`);
            try {
                await page.screenshot({ path: file, fullPage: true });
                console.log(`  📸 ${path.relative(process.cwd(), file)}`);
            } catch (e) {
                console.warn(`  screenshot failed: ${e.message}`);
            }
        }
        await page.setViewportSize(VIEWPORTS[0]);
    }

    fs.writeFileSync(path.join(OUT_DIR, 'auth-tokens.json'), JSON.stringify(allTokens, null, 2));
    console.log(`\n✅ Saved auth tokens → ${path.join(OUT_DIR, 'auth-tokens.json')}`);

    // Build a concise digest.
    const md = ['# TikReel /app — authenticated UI study\n', `Date: ${new Date().toISOString()}\n`];
    for (const [p, t] of Object.entries(allTokens)) {
        md.push(`\n## ${p}\n`);
        md.push(`URL: ${t.url}\n`);
        md.push(
            `Body: \`${t.bodyTokens['background-color']}\` bg · \`${t.bodyTokens.color}\` text · ${t.bodyTokens['font-family'].split(',')[0]}\n`
        );

        if (t.headings) {
            md.push('\n### Headings\n');
            t.headings.forEach((h) => {
                if (h.missing) return;
                md.push(
                    `- **${h.tag}** ${h.fontSize}/${h.fontWeight} · ${h.color} — "${h.text}"\n`
                );
            });
        }
        if (t.navSamples?.length) {
            md.push('\n### Nav / sidebar\n');
            t.navSamples.forEach((n) => {
                md.push(`- ${n.tag} · ${n.width}×${n.height} · ${n.items} items · bg ${n.bg}\n`);
            });
        }
        if (t.cardSamples?.length) {
            md.push('\n### Cards\n');
            t.cardSamples.forEach((c) => {
                md.push(`- ${c.tag} · radius ${c.borderRadius} · pad ${c.padding} · bg ${c.bg}\n`);
                if (c.boxShadow !== 'none') md.push(`    shadow: ${c.boxShadow}\n`);
            });
        }
        if (t.btnSamples?.length) {
            md.push('\n### Buttons (variants)\n');
            t.btnSamples.forEach((b, i) => {
                md.push(
                    `- ${i + 1}. "${b.text}" · bg \`${b.bg}\` · radius ${b.borderRadius} · ${b.fontSize}/${b.fontWeight} · pad ${b.padding}\n`
                );
                if (b.boxShadow !== 'none') md.push(`    shadow: ${b.boxShadow}\n`);
                if (b.transition && b.transition !== 'all 0s ease 0s')
                    md.push(`    transition: ${b.transition}\n`);
            });
        }
        if (t.gradientUses?.length) {
            md.push('\n### Gradients\n');
            t.gradientUses.forEach((g) => {
                md.push(`- ${g.sel}: \`${g.bg}\`\n`);
            });
        }
    }
    fs.writeFileSync(path.join(OUT_DIR, 'auth-summary.md'), md.join(''));
    console.log(`✅ Wrote auth-summary.md`);

    await page.close();
    await browser.close();
})();
