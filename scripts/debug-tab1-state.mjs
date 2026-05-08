// Quick probe of tab1-orders state right after main.html hard load.
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8080';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();

await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.fill('#username', 'admin');
await page.fill('#password', 'admin@@');
await page.press('#password', 'Enter');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);

await page.goto(`${BASE}/orders-report/main.html?t=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);

const frames = page.frames();
console.log('FRAMES:');
frames.forEach((f, i) => console.log(`  #${i} url="${f.url()}"`));

const tab1 = frames.find((f) => f.url().includes('tab1-orders.html'));
if (!tab1) { console.log('No tab1 frame.'); await browser.close(); process.exit(0); }

const probe = await tab1.evaluate(() => {
    const out = {};
    const sel = document.getElementById('campaignFilter');
    out.campaignFilterOptions = sel ? [...sel.options].map((o) => ({ v: o.value, t: o.textContent.trim().slice(0, 60) })) : 'NOT FOUND';
    out.campaignFilterDisplay = sel ? getComputedStyle(sel).display : null;
    const modal = document.getElementById('selectCampaignModal');
    out.modalDisplay = modal ? getComputedStyle(modal).display : 'NOT FOUND';
    const modalDropdown = document.getElementById('selectCampaignDropdown');
    out.modalDropdownOptions = modalDropdown ? [...modalDropdown.options].map((o) => ({ v: o.value, t: o.textContent.trim().slice(0, 60) })) : 'NOT FOUND';
    out.activeCampaignId = window.activeCampaignId;
    out.allCampaignsKeys = window.campaignManager?.allCampaigns ? Object.keys(window.campaignManager.allCampaigns).slice(0, 10) : 'no manager';
    out.allCampaignCount = window.campaignManager?.allCampaigns ? Object.keys(window.campaignManager.allCampaigns).length : 0;
    return out;
});
console.log(JSON.stringify(probe, null, 2));

await browser.close();
