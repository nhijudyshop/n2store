import { chromium } from 'playwright';
const BASE = 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });
// Use viewport matching typical user (768 tall)
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/web2/products/index.html?t=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4500);

const r = await page.evaluate(() => {
  const aside = document.querySelector('.web2-aside');
  const nav = document.querySelector('.web2-aside .web2-nav');
  const footer = document.querySelector('.web2-user-footer');
  const loginBtn = document.querySelector('#web2UserLogin');
  return {
    vp: { w: window.innerWidth, h: window.innerHeight },
    shellH: document.querySelector('.web2-shell')?.offsetHeight,
    asideH: aside?.offsetHeight,
    asideOverflow: aside ? getComputedStyle(aside).overflow : null,
    asideRect: aside?.getBoundingClientRect(),
    navH: nav?.offsetHeight,
    footerH: footer?.offsetHeight,
    footerRect: footer?.getBoundingClientRect(),
    loginBtnExists: !!loginBtn,
    loginBtnRect: loginBtn?.getBoundingClientRect(),
    loginBtnVisible: loginBtn && loginBtn.getBoundingClientRect().bottom <= window.innerHeight,
  };
});
console.log(JSON.stringify(r, null, 2));
await page.screenshot({ path: '/tmp/prods-footer.png' });
await browser.close();
