# Latest Snapshot — `gemini-tryon/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-195141-4265971`
**Session file**: [`./20260627-195141-4265971.md`](../20260627-195141-4265971.md)
**Commit**: `4265971` — feat(web2/live): gom SP cha-con nhiều biến thể thành 1 card (by:'parent')
**Last updated**: 2026-06-27 19:51:41 +07
**Summary**: feat(web2/live): gom SP cha-con nhiều biến thể thành 1 card (by:'parent')

## Files changed in this commit (`gemini-tryon/`)

- `gemini-tryon/app.py`

## Last 5 commits touching `gemini-tryon/`

- `9ce19fc45` fix(gemini-tryon): watchdog*timeout + timeout cao cho image gen (research issue #294/#252) - tao anh >120s khong bi giet *(2026-06-27)\_
- `6f6dc5c56` feat(gemini-tryon): uu tien model Flash o cookie + xoay tua, fail thi fallback Nano Banana paid (+model fallback resilience) _(2026-06-27)_
- `eb787f64d` feat(gemini-tryon): admin chon nguon tao anh (account cu the / Nano Banana paid) - selector admin-only _(2026-06-27)_
- `c9f316dfc` auto: session update _(2026-06-27)_
- `27c148ea6` feat(gemini-tryon): temporary mode (khong luu hoi thoai) + log loi tung account de debug 1-acc-full-4-acc-0 _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-195141-4265971` cho Claude walk chain theo CLAUDE.md protocol.
