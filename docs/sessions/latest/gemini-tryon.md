# Latest Snapshot — `gemini-tryon/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-092611-ff504d7`
**Session file**: [`./20260628-092611-ff504d7.md`](../20260628-092611-ff504d7.md)
**Commit**: `ff504d7` — feat(so-order): SP cha nhiều biến thể = khối tách biệt rõ (giữ NCC/Ảnh-HĐ rowspan)
**Last updated**: 2026-06-28 09:26:11 +07
**Summary**: feat(so-order): SP cha nhiều biến thể = khối tách biệt rõ (giữ NCC/Ảnh-HĐ rowspan)

## Files changed in this commit (`gemini-tryon/`)

- `gemini-tryon/app.py`

## Last 5 commits touching `gemini-tryon/`

- `f0ae7dfe0` feat(ai-hub+gemini): đính ảnh chat Gemini, fallback paid fail-fast, PREMIUM ưu tiên xoay tua _(2026-06-28)_
- `ed52187be` auto: session update _(2026-06-28)_
- `9ce19fc45` fix(gemini-tryon): watchdog*timeout + timeout cao cho image gen (research issue #294/#252) - tao anh >120s khong bi giet *(2026-06-27)\_
- `6f6dc5c56` feat(gemini-tryon): uu tien model Flash o cookie + xoay tua, fail thi fallback Nano Banana paid (+model fallback resilience) _(2026-06-27)_
- `eb787f64d` feat(gemini-tryon): admin chon nguon tao anh (account cu the / Nano Banana paid) - selector admin-only _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-092611-ff504d7` cho Claude walk chain theo CLAUDE.md protocol.
