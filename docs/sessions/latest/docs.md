# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-114803-038a746`
**Session file**: [`./20260629-114803-038a746.md`](../20260629-114803-038a746.md)
**Commit**: `038a746` — fix(units): thêm lib/web2-shelf-stt thiếu (routes require → tránh crash web2-api) + dev-log
**Last updated**: 2026-06-29 11:48:03 +07
**Summary**: Thống nhất STT kệ 1 nguồn (lib/web2-shelf-stt: campaign_stt??display_stt) — tem+unit-scan+board/TV khớp; vá lib thiếu tránh crash web2-api

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `038a74651` fix(units): thêm lib/web2-shelf-stt thiếu (routes require → tránh crash web2-api) + dev-log _(2026-06-29)_
- `2eba8f8e3` chore(session): RESUME:20260629-113943-fd8f3eb _(2026-06-29)_
- `343ba2e48` fix(goods-weight): hết tràn ngang mobile — number input co được trong grid (min-width:0 + width:100%) _(2026-06-29)_
- `4faf5bb81` chore(session): RESUME:20260629-113245-78dd026 _(2026-06-29)_
- `78dd026c1` feat(unit-scan): danh sách TẤT CẢ tem của SP (ẩn/bật, mỗi tem→STT) + QR tem TO HƠN _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-114803-038a746` cho Claude walk chain theo CLAUDE.md protocol.
