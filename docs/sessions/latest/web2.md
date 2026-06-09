# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-170747-3db60ad`
**Session file**: [`./20260609-170747-3db60ad.md`](../20260609-170747-3db60ad.md)
**Commit**: `3db60ad` — feat(web2-kpi): KPI model base-delta (livestream) + 100% (inbox), gộp 1 KPI
**Last updated**: 2026-06-09 17:07:47 +07
**Summary**: feat(web2-kpi): KPI model base-delta (livestream) + 100% (inbox), gộp 1 KPI

## Files changed in this commit (`web2/`)

- `web2/kpi/index.html`
- `web2/kpi/js/kpi-dashboard.js`

## Last 5 commits touching `web2/`

- `3db60ad23` feat(web2-kpi): KPI model base-delta (livestream) + 100% (inbox), gộp 1 KPI _(2026-06-09)_
- `04331544d` feat(web2): mã PBH vào giữa QR (Web2QR.centerLabel, EC H) — vẫn quét được _(2026-06-09)_
- `b72e5a85e` auto: session update _(2026-06-09)_
- `74098cab5` auto: session update _(2026-06-09)_
- `100ef0323` fix(native-orders): icon 🖨 → XEM bill (preview) thay vì in; thêm Web2Bill.openPreview _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-170747-3db60ad` cho Claude walk chain theo CLAUDE.md protocol.
