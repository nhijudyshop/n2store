# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-114539-254da26`
**Session file**: [`./20260627-114539-254da26.md`](../20260627-114539-254da26.md)
**Commit**: `254da26` — feat(gemini-tryon): đa account xoay tua + cài 1-click (bộ cài máy POS [4]) + route free vào tab Ghép đồ
**Last updated**: 2026-06-27 11:45:39 +07
**Summary**: gemini-tryon đa account xoay tua + cài 1-click (bộ cài [4]) + route free tab Ghép đồ

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/shared/web2-pos-installer.js`
- `web2/shared/web2-tryon.js`

## Last 5 commits touching `web2/`

- `254da264b` feat(gemini-tryon): đa account xoay tua + cài 1-click (bộ cài máy POS [4]) + route free vào tab Ghép đồ _(2026-06-27)_
- `41e805464` feat(web2 ai-hub): thư viện 49 prompt Nano Banana + nhóm Ghép mặt + try-on cải tiến + sidecar gemini-tryon (cookie FREE) _(2026-06-27)_
- `6ed930d63` feat(web2/cham-cong): audit "thời gian chỉnh sửa" chấm công (ai + lúc nào) + fix false-stamp nghỉ phép _(2026-06-27)_
- `b27f50bda` auto: session update _(2026-06-27)_
- `f614de58c` feat(web2 zalo R3): auto-bootstrap account từ cookie chat.zalo.me (không cần bấm nút) _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-114539-254da26` cho Claude walk chain theo CLAUDE.md protocol.
