# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-142040-43c92f7`
**Session file**: [`./20260620-142040-43c92f7.md`](../20260620-142040-43c92f7.md)
**Commit**: `43c92f7` — feat(web2/jt-tracking): chat KH bam SDT -> modal 3-cot 'Chat khach hang' giong native-orders
**Last updated**: 2026-06-20 14:20:40 +07
**Summary**: web2/jt-tracking: chat KH bam SDT -> modal 3-cot Chat khach hang giong native-orders

## Files changed in this commit (`web2/`)

- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-modals.js`

## Last 5 commits touching `web2/`

- `43c92f7fc` feat(web2/jt-tracking): chat KH bam SDT -> modal 3-cot 'Chat khach hang' giong native-orders _(2026-06-20)_
- `6104e5699` fix(web2): dong not 16 muc audit con lai (MEDIUM/LOW) — money/msg-guard/frontend; toan bo 121 issue da fix _(2026-06-20)_
- `65d6ba9b4` fix(web2): medium/low audit fixes (25 file) — leaks/races/guards + bump ?v=20260620c _(2026-06-20)_
- `805979487` chore(web2): bump ?v=20260620b (sidebar escapeHtml + chat double-send guard) -> deploy frontend security fixes _(2026-06-20)_
- `c42670c11` fix(web2): audit fixes — gate auth + SSRF + money + idempotency (21 file) _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-142040-43c92f7` cho Claude walk chain theo CLAUDE.md protocol.
