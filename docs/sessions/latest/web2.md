# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-153500-f17cf53`
**Session file**: [`./20260626-153500-f17cf53.md`](../20260626-153500-f17cf53.md)
**Commit**: `f17cf53` — docs(dev-log): system UI + flow audit + 5 fixes (2026-06-26)
**Last updated**: 2026-06-26 15:35:00 +07
**Summary**: System UI (modal/AI widget) + audit 19-agent luồng (12 bug) + fix 5 (report merge/refunds KPI, nhận hàng NCC, hủy PBH restock); defer 6 money/stock

## Files changed in this commit (`web2/`)

- `web2/shared/web2-ai-assistant.js`
- `web2/shared/web2-ai-page-registry.js`
- `web2/shared/web2-sidebar.js`
- `web2/system/css/system.css`
- `web2/system/index.html`
- `web2/system/js/system-services.js`

## Last 5 commits touching `web2/`

- `a4f55ece1` feat(web2/system): modal chi tiết service+bảng DB (clickable) + bật AI widget cho trang _(2026-06-26)_
- `b91dee909` feat(web2/products): tự tạo TÊN SP từ loại + Màu/Size (sửa được) — Kho SP _(2026-06-26)_
- `a7866d391` feat(web2): Báo cáo kho thêm ĐỊA DANH (cha NCC+SP) + fix adversarial review _(2026-06-26)_
- `e64754570` auto: session update _(2026-06-26)_
- `556aa7965` refactor(web2-variant-picker): genName dùng toLocaleUpperCase('vi-VN') (defensive) _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-153500-f17cf53` cho Claude walk chain theo CLAUDE.md protocol.
