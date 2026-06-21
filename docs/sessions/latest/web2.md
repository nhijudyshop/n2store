# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-232439-261b4fb`
**Session file**: [`./20260621-232439-261b4fb.md`](../20260621-232439-261b4fb.md)
**Commit**: `261b4fb` — docs(web2) live-tv: dev-log Phase5-6 + SSE đa-instance finding + regen codemap
**Last updated**: 2026-06-21 23:24:39 +07
**Summary**: feat(web2) TV Livestream: chiến dịch gắn SP + 2 trang TV/điều khiển + số NCC báo realtime + migrate 2 fork → Web2Campaign

## Files changed in this commit (`web2/`)

- `web2/live-control/css/live-control.css`
- `web2/live-control/index.html`
- `web2/live-control/js/live-control.js`
- `web2/live-tv/css/live-tv.css`
- `web2/live-tv/index.html`
- `web2/live-tv/js/live-tv.js`
- `web2/shared/web2-campaign.js`
- `web2/shared/web2-sidebar.js`
- `web2/shared/web2-variant-group.js`

## Last 5 commits touching `web2/`

- `917941830` fix(web2) live-tv: mount sidebar control page + [hidden] display gotcha trên TV empty/grid _(2026-06-21)_
- `873eaf783` fix(web2) live-tv: số NCC báo qua PATCH /campaign-products/pending (topic web2:campaign-products tin cậy) _(2026-06-21)_
- `ade9d1920` feat(web2) live-tv Phase2-4,7: Web2Campaign + Web2VariantGroup shared + 2 trang TV + menu _(2026-06-21)_
- `fa34c3ed2` refactor(web2): hệ KPI 1 nguồn (web2-kpi-core + Web2Kpi) + enforce scope NV/admin + mask pill + fix bug _(2026-06-21)_
- `bde0e54ae` fix(web2-shell): GLOBAL ≤900px main full-width trên mọi trang (sửa flex-direction no-op) _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-232439-261b4fb` cho Claude walk chain theo CLAUDE.md protocol.
