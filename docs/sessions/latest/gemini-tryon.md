# Latest Snapshot — `gemini-tryon/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-121617-2f7e2d9`
**Session file**: [`./20260627-121617-2f7e2d9.md`](../20260627-121617-2f7e2d9.md)
**Commit**: `2f7e2d9` — fix(gemini-tryon): heartbeat đăng ký registry — SSL certifi + User-Agent (worker chặn Python-urllib 403)
**Last updated**: 2026-06-27 12:16:17 +07
**Summary**: fix(gemini-tryon): heartbeat đăng ký registry — SSL certifi + User-Agent (worker chặn Python-urllib 403)

## Files changed in this commit (`gemini-tryon/`)

- `gemini-tryon/serve.py`

## Last 5 commits touching `gemini-tryon/`

- `2f7e2d911` fix(gemini-tryon): heartbeat đăng ký registry — SSL certifi + User-Agent (worker chặn Python-urllib 403) _(2026-06-27)_
- `8c5c8e31a` auto: session update _(2026-06-27)_
- `66cd01006` docs(session): fill detail RESUME:20260627-114933-a8933df _(2026-06-27)_
- `254da264b` feat(gemini-tryon): đa account xoay tua + cài 1-click (bộ cài máy POS [4]) + route free vào tab Ghép đồ _(2026-06-27)_
- `41e805464` feat(web2 ai-hub): thư viện 49 prompt Nano Banana + nhóm Ghép mặt + try-on cải tiến + sidecar gemini-tryon (cookie FREE) _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-121617-2f7e2d9` cho Claude walk chain theo CLAUDE.md protocol.
