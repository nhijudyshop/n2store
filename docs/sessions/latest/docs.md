# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-184033-4635d5e`
**Session file**: [`./20260604-184033-4635d5e.md`](../20260604-184033-4635d5e.md)
**Commit**: `4635d5e` — feat(web2): photo-studio — Chọn đúng món (tap-to-pick chủ thể bằng MobileSAM/Transformers.js, fallback WASM)
**Last updated**: 2026-06-04 18:40:33 +07
**Summary**: feat(web2): photo-studio — Chọn đúng món (tap-to-pick chủ thể bằng MobileSAM/Transformers.js, fallback W...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `4635d5eb5` feat(web2): photo-studio — Chọn đúng món (tap-to-pick chủ thể bằng MobileSAM/Transformers.js, fallback WASM) _(2026-06-04)_
- `32c851146` chore(session): RESUME:20260604-183938-d9b2be9 _(2026-06-04)_
- `2d1557e81` docs(dev-log): audit realtime toan bo trang + phu SSE refund/delivery/variants/generic _(2026-06-04)_
- `a3f08312a` chore(session): RESUME:20260604-181621-b45a65c _(2026-06-04)_
- `b45a65c63` docs(dev-log): toi uu keo-tha tpos-pancake + test pipeline drop->don _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-184033-4635d5e` cho Claude walk chain theo CLAUDE.md protocol.
