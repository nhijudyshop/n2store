# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-184436-5bcb0ae`
**Session file**: [`./20260604-184436-5bcb0ae.md`](../20260604-184436-5bcb0ae.md)
**Commit**: `5bcb0ae` — feat(web2): photo-studio — nút ✂ tách món vừa chọn (SAM) ra ảnh PNG riêng, cắt sát viền
**Last updated**: 2026-06-04 18:44:36 +07
**Summary**: feat(web2): photo-studio — nút ✂ tách món vừa chọn (SAM) ra ảnh PNG riêng, cắt sát viền

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `5bcb0aed6` feat(web2): photo-studio — nút ✂ tách món vừa chọn (SAM) ra ảnh PNG riêng, cắt sát viền _(2026-06-04)_
- `d1675a35b` chore(session): RESUME:20260604-184354-65c8add _(2026-06-04)_
- `06e4497c4` fix(web2-sepay): webhook insert cot body -> raw*data (web2Db) + endpoint replay retry-queue *(2026-06-04)\_
- `0a9a96138` chore(session): RESUME:20260604-184033-4635d5e _(2026-06-04)_
- `4635d5eb5` feat(web2): photo-studio — Chọn đúng món (tap-to-pick chủ thể bằng MobileSAM/Transformers.js, fallback WASM) _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-184436-5bcb0ae` cho Claude walk chain theo CLAUDE.md protocol.
