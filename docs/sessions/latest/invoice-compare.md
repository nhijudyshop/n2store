# Latest Snapshot — `invoice-compare/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260612-200128-2a4021b`
**Session file**: [`./20260612-200128-2a4021b.md`](../20260612-200128-2a4021b.md)
**Commit**: `2a4021b` — fix(orders-report): gộp đơn trùng SĐT — hết miss tag "ĐÃ GỘP KHÔNG CHỐT" theo máy + progress UI trong modal
**Last updated**: 2026-06-12 20:01:28 +07
**Summary**: fix(orders-report): gộp đơn trùng SĐT — hết miss tag "ĐÃ GỘP KHÔNG CHỐT" theo máy + progress UI tro...

## Files changed in this commit (`invoice-compare/`)

- `invoice-compare/index.html`

## Last 5 commits touching `invoice-compare/`

- `248532b73` feat(web2): ENFORCE-PREP — wire x-web2-token toàn bộ client gọi route soft-gated _(2026-06-12)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `445c4a21d` fix(invoice-compare): thêm shared/js/firebase-config.js trước token-manager _(2026-04-28)_
- `f8287d6a1` fix(smoke-test phase 3 batch 1): G1 missing globals + G2 duplicate identifiers _(2026-04-28)_
- `92e1b8249` fix(cors): full sweep — route all Render calls via Cloudflare Worker _(2026-04-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260612-200128-2a4021b` cho Claude walk chain theo CLAUDE.md protocol.
