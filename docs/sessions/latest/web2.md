# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-182505-1cc04a6`
**Session file**: [`./20260630-182505-1cc04a6.md`](../20260630-182505-1cc04a6.md)
**Commit**: `1cc04a6` — auto: session update
**Last updated**: 2026-06-30 18:25:05 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-bh-core.js`
- `web2/balance-history/js/web2-partner-enricher.js`
- `web2/balance-history/js/web2-pm-core.js`
- `web2/ck-dashboard/index.html`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/web2-customer-wallet-state.js`
- `web2/customers/index.html`
- `web2/jt-tracking/index.html`
- `web2/returns/index.html`
- `web2/shared/chat-panel/web2-chat-entity-detect.js`
- `web2/shared/web2-ck-review.js`
- `web2/shared/web2-customer-detail-modal.js`
- `web2/shared/web2-customer-store.js`
- `web2/shared/web2-phone-utils.js`
- `web2/shared/web2-return-bill.js`
- `web2/shared/web2-wallet-api.js`
- `web2/shared/web2-wallet-balance.js`
- `web2/shared/web2-zalo.js`
- `web2/system/data/web2-dedup-audit.json`

## Last 5 commits touching `web2/`

- `1cc04a641` auto: session update _(2026-06-30)_
- `85f9fe063` refactor(web2 util): gộp money(11)→Web2Format.vnd + escape(76)→Web2Escape.escapeHtml (delegate-with-fallback); date đã-delegate, phone hoãn _(2026-06-30)_
- `c23125cd9` auto: session update _(2026-06-30)_
- `cc6bfa7d2` feat(system): tab 'Trùng lặp / 1-nguồn' (dedup audit toàn bộ Web 2.0) — 15 nhóm, JSON-driven _(2026-06-30)_
- `19471a7f8` auto: session update _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-182505-1cc04a6` cho Claude walk chain theo CLAUDE.md protocol.
