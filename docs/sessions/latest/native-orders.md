# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-232439-261b4fb`
**Session file**: [`./20260621-232439-261b4fb.md`](../20260621-232439-261b4fb.md)
**Commit**: `261b4fb` — docs(web2) live-tv: dev-log Phase5-6 + SSE đa-instance finding + regen codemap
**Last updated**: 2026-06-21 23:24:39 +07
**Summary**: feat(web2) TV Livestream: chiến dịch gắn SP + 2 trang TV/điều khiển + số NCC báo realtime + migrate 2 fork → Web2Campaign

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-filters-campaigns.js`

## Last 5 commits touching `native-orders/`

- `80e96e30d` refactor(web2) live-tv Phase6: migrate 2 fork chiến dịch → Web2Campaign (1 nguồn) _(2026-06-21)_
- `fa34c3ed2` refactor(web2): hệ KPI 1 nguồn (web2-kpi-core + Web2Kpi) + enforce scope NV/admin + mask pill + fix bug _(2026-06-21)_
- `8de7d629c` feat(web2): KPI User tag — nút Chốt KPI (admin) + health bar chưa-gán/chưa-chốt + filter NV + amber + deep-link _(2026-06-21)_
- `70a481274` auto: session update _(2026-06-21)_
- `a0236bba9` feat(web2): popup lý do tag hiện ẢNH sản phẩm (catalog image*url + fallback snapshot) *(2026-06-21)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-232439-261b4fb` cho Claude walk chain theo CLAUDE.md protocol.
