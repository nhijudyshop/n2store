# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-122437-9eee345`
**Session file**: [`./20260625-122437-9eee345.md`](../20260625-122437-9eee345.md)
**Commit**: `9eee345` — fix(web2/ai-hub): bỏ lộ token web2 qua URL ảnh "Ảnh đã lưu" — fetch+blob thay ?token=
**Last updated**: 2026-06-25 12:24:37 +07
**Summary**: fix lộ token web2 qua URL ảnh Ảnh-đã-lưu (fetch+blob thay ?token=)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `9eee3459a` fix(web2/ai-hub): bỏ lộ token web2 qua URL ảnh "Ảnh đã lưu" — fetch+blob thay ?token= _(2026-06-25)_
- `f8524bc43` chore(session): RESUME:20260625-115356-8deb164 _(2026-06-25)_
- `8deb16492` feat(web2/ai-assistant): 3 công cụ dùng chung trong widget ✨ (Ghép đồ · Card/Video · AI viết mô tả) + fix bảo mật & race _(2026-06-25)_
- `09a1d6dec` feat(web2/ai-assistant): đọc DB thông minh (reducer) + 16 DB*SOURCES mới (audit 23 trang) *(2026-06-25)\_
- `d37bc73ce` chore(session): RESUME:20260625-111847-4625b4a _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-122437-9eee345` cho Claude walk chain theo CLAUDE.md protocol.
