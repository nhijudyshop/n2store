# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-184556-af2ca38`
**Session file**: [`./20260623-184556-af2ca38.md`](../20260623-184556-af2ca38.md)
**Commit**: `af2ca38` — fix(web2): cost-cap hoàn NCC server-side + cart race lock + refund SSE web2:products
**Last updated**: 2026-06-23 18:45:56 +07
**Summary**: web2 money-flow audit: cost-cap hoàn NCC server-side + cart race lock + refund SSE web2:products (3 bug verified)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `af2ca38c6` fix(web2): cost-cap hoàn NCC server-side + cart race lock + refund SSE web2:products _(2026-06-23)_
- `a2c5d76fc` chore(session): RESUME:20260623-183215-80cfd2d _(2026-06-23)_
- `80cfd2d63` refactor(web2-zalo): bỏ lưu phiên trên server + bỏ QR — chỉ đăng nhập qua chat.zalo.me (browser) _(2026-06-23)_
- `bb3a488e9` fix(web2): gate 11 native-orders mutation routes (requireWeb2AuthSoft) + BIGINT Number() in balance-history _(2026-06-23)_
- `7334d5ded` chore(session): RESUME:20260623-181746-e01086f _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-184556-af2ca38` cho Claude walk chain theo CLAUDE.md protocol.
