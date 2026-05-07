#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// TIKREEL UI STUDY — Visit tikreel.net + /app, capture design tokens, screenshots,
// animation classes, and button styles for cloning into AI KOL Studio.
//
// Output: downloads/tikreel-ui-study/{summary.md, tokens.json, *.png}
//
// Public-only — no login required (tikreel landing + /app marketing redirect).
// =====================================================

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '..', 'downloads', 'tikreel-ui-study');
fs.mkdirSync(OUT_DIR, { recursive: true });

const TARGETS = [
    { url: 'https://www.tikreel.net/', name: 'landing' },
    { url: 'https://www.tikreel.net/app', name: 'app-redirect' },
    { url: 'https://www.tikreel.net/login', name: 'login' },
    { url: 'https://www.tikreel.net/pricing', name: 'pricing' },
];

const VIEWPORTS = [
    { width: 1440, height: 900, name: 'desktop' },
    { width: 375, height: 812, name: 'mobile' },
];

(async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: VIEWPORTS[0] });
    const page = await ctx.newPage();

    const allTokens = {};
    const summary = [];

    for (const t of TARGETS) {
        console.log(`\n[study] === ${t.name} (${t.url}) ===`);
        try {
            await page.goto(t.url, { waitUntil: 'networkidle', timeout: 30000 });
        } catch (e) {
            console.warn(`  goto failed: ${e.message}`);
            continue;
        }
        await page.waitForTimeout(2500);
        const finalUrl = page.url();
        console.log(`  final URL: ${finalUrl}`);

        // Extract design tokens from <body> + most-styled large elements.
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

            // Find unique button styles.
            const btns = Array.from(
                document.querySelectorAll('button, a[role="button"], [class*="button"]')
            );
            const btnSamples = [];
            const seen = new Set();
            for (const b of btns.slice(0, 50)) {
                const cs = getComputedStyle(b);
                const key =
                    cs.backgroundColor + '|' + cs.color + '|' + cs.borderRadius + '|' + cs.padding;
                if (seen.has(key)) continue;
                seen.add(key);
                btnSamples.push({
                    text: b.textContent.trim().slice(0, 40),
                    bg: cs.backgroundColor,
                    color: cs.color,
                    border: cs.border,
                    borderRadius: cs.borderRadius,
                    padding: cs.padding,
                    fontSize: cs.fontSize,
                    fontWeight: cs.fontWeight,
                    boxShadow: cs.boxShadow,
                    transition: cs.transition,
                });
                if (btnSamples.length >= 8) break;
            }

            // Heading typography hierarchy.
            const headings = ['h1', 'h2', 'h3'].map((tag) => {
                const el = document.querySelector(tag);
                if (!el) return { tag, missing: true };
                const cs = getComputedStyle(el);
                return {
                    tag,
                    text: el.textContent.trim().slice(0, 60),
                    fontSize: cs.fontSize,
                    fontWeight: cs.fontWeight,
                    lineHeight: cs.lineHeight,
                    letterSpacing: cs.letterSpacing,
                    color: cs.color,
                    fontFamily: cs.fontFamily,
                };
            });

            // CSS custom properties on :root (Tailwind tokens / theme vars).
            const rootStyle = getComputedStyle(document.documentElement);
            const cssVars = {};
            for (let i = 0; i < rootStyle.length; i++) {
                const name = rootStyle[i];
                if (!name.startsWith('--')) continue;
                cssVars[name] = rootStyle.getPropertyValue(name).trim();
            }

            // Detect framework hints.
            const frameworkHints = {
                hasNextData: !!document.getElementById('__NEXT_DATA__'),
                hasTailwind: !!Array.from(document.styleSheets).find((s) => {
                    try {
                        return (
                            (s.href || '').includes('tailwind') ||
                            Array.from(s.cssRules || []).some((r) =>
                                /\.\w+\\\:/.test(r.cssText || '')
                            )
                        );
                    } catch (_) {
                        return false;
                    }
                }),
                lucideIcons: !!document.querySelector('svg[class*="lucide"]'),
                framerMotion:
                    !!document.querySelector('[style*="will-change"]') ||
                    !!document.querySelector('[data-framer-motion]') ||
                    !!Array.from(document.scripts).find((s) =>
                        (s.src || '').toLowerCase().includes('framer')
                    ),
            };

            // Color usage on largest sections (sniff palette).
            const sections = Array.from(
                document.querySelectorAll('section, header, footer, nav, [class*="hero"]')
            ).slice(0, 10);
            const sectionPalette = sections.map((s) => {
                const cs = getComputedStyle(s);
                return {
                    tag: s.tagName,
                    cls: (s.className || '').toString().slice(0, 100),
                    bg: cs.backgroundColor,
                    bgImage: cs.backgroundImage.slice(0, 80),
                };
            });

            // Animation/transition classes hint at motion direction.
            const animatedEls = Array.from(
                document.querySelectorAll(
                    '[class*="anim"], [class*="motion"], [class*="transition"]'
                )
            ).slice(0, 10);
            const animSamples = animatedEls.map((el) => ({
                tag: el.tagName,
                cls: (el.className || '').toString().slice(0, 100),
            }));

            return {
                bodyTokens,
                btnSamples,
                headings,
                cssVars,
                frameworkHints,
                sectionPalette,
                animSamples,
            };
        });

        allTokens[t.name] = { url: finalUrl, ...tokens };

        // Take screenshots in both viewports.
        for (const v of VIEWPORTS) {
            await page.setViewportSize({ width: v.width, height: v.height });
            await page.waitForTimeout(800);
            const file = path.join(OUT_DIR, `${t.name}-${v.name}.png`);
            await page.screenshot({ path: file, fullPage: true });
            console.log(`  📸 ${path.relative(process.cwd(), file)}`);
        }
        // Restore desktop viewport for the next page so the layout we sample
        // is consistent.
        await page.setViewportSize(VIEWPORTS[0]);

        const buttonsCount = tokens.btnSamples.length;
        const headingFonts = [...new Set(tokens.headings.map((h) => h.fontFamily))].join(' / ');
        summary.push(
            `- **${t.name}** — ${buttonsCount} btn variants · headings: ${headingFonts.slice(0, 100)}`
        );
    }

    fs.writeFileSync(path.join(OUT_DIR, 'tokens.json'), JSON.stringify(allTokens, null, 2));

    // ---- Build a digest summary.md ----
    const digest = ['# TikReel UI Study\n', `Date: ${new Date().toISOString()}\n`];
    for (const [name, t] of Object.entries(allTokens)) {
        digest.push(`\n## ${name} — ${t.url}\n`);
        digest.push(
            `**Body**: \`${t.bodyTokens['background-color']}\` bg · \`${t.bodyTokens.color}\` text · font ${t.bodyTokens['font-family'].split(',')[0]}\n`
        );

        if (t.headings) {
            digest.push('\n### Typography\n');
            t.headings.forEach((h) => {
                if (h.missing) return;
                digest.push(
                    `- **${h.tag}**: ${h.fontSize} · weight ${h.fontWeight} · lh ${h.lineHeight} · ${h.fontFamily.split(',')[0]} — "${h.text}"\n`
                );
            });
        }

        if (t.btnSamples?.length) {
            digest.push('\n### Buttons (top 8 distinct variants)\n');
            t.btnSamples.forEach((b, i) => {
                digest.push(
                    `- ${i + 1}. "${b.text}" · bg \`${b.bg}\` · radius ${b.borderRadius} · ${b.fontSize}/${b.fontWeight} · pad ${b.padding}\n`
                );
            });
        }

        if (t.cssVars && Object.keys(t.cssVars).length) {
            digest.push('\n### CSS custom properties on :root (sample)\n```\n');
            Object.entries(t.cssVars)
                .slice(0, 30)
                .forEach(([k, v]) => {
                    digest.push(`${k}: ${v}\n`);
                });
            digest.push('```\n');
        }

        if (t.sectionPalette?.length) {
            digest.push('\n### Section backgrounds\n');
            t.sectionPalette.forEach((s) => {
                digest.push(`- \`${s.tag}\` ${s.bg}${s.bgImage !== 'none' ? ' (img)' : ''}\n`);
            });
        }

        if (t.frameworkHints) {
            digest.push('\n### Stack hints\n');
            digest.push(
                `- Next.js: ${t.frameworkHints.hasNextData} · Tailwind: ${t.frameworkHints.hasTailwind} · Lucide: ${t.frameworkHints.lucideIcons} · Framer Motion: ${t.frameworkHints.framerMotion}\n`
            );
        }
    }

    fs.writeFileSync(path.join(OUT_DIR, 'summary.md'), digest.join(''));
    console.log(`\n✅ wrote tokens.json + summary.md → ${OUT_DIR}`);

    await browser.close();
})();
