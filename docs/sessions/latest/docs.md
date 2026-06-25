# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-063217-7e1bfdb`
**Session file**: [`./20260626-063217-7e1bfdb.md`](../20260626-063217-7e1bfdb.md)
**Commit**: `7e1bfdb` — feat(chat): nút 📍 thủ công trên tin KH để thêm địa chỉ vào đơn (fallback auto-detect)
**Last updated**: 2026-06-26 06:32:17 +07
**Summary**: Chat: nút thủ công 📍 thêm địa chỉ/SĐT tin KH vào đơn (fallback auto-detect); verify Playwright MCP

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `7e1bfdb5b` feat(chat): nút 📍 thủ công trên tin KH để thêm địa chỉ vào đơn (fallback auto-detect) _(2026-06-26)_
- `99604b7a7` chore(session): RESUME:20260626-061005-a3b8867 _(2026-06-26)_
- `a3b88678e` feat(native-orders/chat): tự nhận diện địa chỉ + nút "Thêm vào đơn" (Feature 3) _(2026-06-26)_
- `b2b75e811` chore(session): RESUME:20260625-230809-daf1441 _(2026-06-25)_
- `daf144191` fix(web2/products): mã SP full-width không cắt — chạy dài qua phải _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-063217-7e1bfdb` cho Claude walk chain theo CLAUDE.md protocol.
