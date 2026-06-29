# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-114803-038a746`
**Session file**: [`./20260629-114803-038a746.md`](../20260629-114803-038a746.md)
**Commit**: `038a746` — fix(units): thêm lib/web2-shelf-stt thiếu (routes require → tránh crash web2-api) + dev-log
**Last updated**: 2026-06-29 11:48:03 +07
**Summary**: Thống nhất STT kệ 1 nguồn (lib/web2-shelf-stt: campaign_stt??display_stt) — tem+unit-scan+board/TV khớp; vá lib thiếu tránh crash web2-api

## Files changed in this commit (`render.com/`)

- `render.com/lib/web2-shelf-stt.js`

## Last 5 commits touching `render.com/`

- `038a74651` fix(units): thêm lib/web2-shelf-stt thiếu (routes require → tránh crash web2-api) + dev-log _(2026-06-29)_
- `fd8f3eb92` auto: session update _(2026-06-29)_
- `8c1a9c556` feat(goods-weight): trang Cân Nặng Hàng ⚖️ — hàng về kiện cân + ảnh BYTEA + SSE web2:goods-weight _(2026-06-29)_
- `bc8640b9f` feat(clearance): admin-only chuyển SP rớt xả ↔ kho chính (gate POST /:id/clearance + ẩn nút non-admin) _(2026-06-29)_
- `74f31a925` feat(clearance): hàng rớt xả theo CHIẾN DỊCH (da*doi_soat>70% + most-recent campaign + 1 ngày) *(2026-06-29)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-114803-038a746` cho Claude walk chain theo CLAUDE.md protocol.
