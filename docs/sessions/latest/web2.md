# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-093537-b062f9d`
**Session file**: [`./20260619-093537-b062f9d.md`](../20260619-093537-b062f9d.md)
**Commit**: `b062f9d` — auto: session update
**Last updated**: 2026-06-19 09:35:37 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/shared/web2-customer-chat-core.js`

## Last 5 commits touching `web2/`

- `b062f9dca` auto: session update _(2026-06-19)_
- `7d9fc8ec7` refactor(web2): adoption sâu hơn — JWT/SoOrderUtils/PancakeImport delegate (4) + load feature modules _(2026-06-19)_
- `9b476a757` feat(web2): Phase B — 6 shared modules (Jwt/Avatar/Canvas/SoOrder/ImageLightbox/PancakeImport) _(2026-06-19)_
- `27296dea5` refactor(web2): Phase C — adopt shared utils (thin-delegate + fallback) → '1 nguồn' _(2026-06-19)_
- `d6c0c7b71` feat(native-orders): Task 1 — chat-unification, openInteractions → Web2CustomerChat (comments → info col) _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-093537-b062f9d` cho Claude walk chain theo CLAUDE.md protocol.
