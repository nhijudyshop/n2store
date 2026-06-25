# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-170704-a90cf11`
**Session file**: [`./20260625-170704-a90cf11.md`](../20260625-170704-a90cf11.md)
**Commit**: `a90cf11` — fix(web2): backfill region từ PREFIX MÃ (HN/HC) — note ILIKE chữ Việt không khớp Unicode
**Last updated**: 2026-06-25 17:07:04 +07
**Summary**: live-control TV NCC/Bán/Cọc/Còn + địa danh riêng (region) — fix backfill code-prefix, verify heal 5/5

## Files changed in this commit (`so-order/`)

- `so-order/js/so-order-barcode.js`
- `so-order/js/so-order-kho-sync.js`
- `so-order/js/so-order-modal-random.js`

## Last 5 commits touching `so-order/`

- `6ddc1a83a` fix(web2): auto-heal region từ note (un-gate migration 080) + random NCC bỏ địa danh _(2026-06-25)_
- `5d6d71300` feat(web2/live-control,live-tv): ĐỊA DANH riêng + TV NCC/Bán/Cọc/Còn _(2026-06-25)_
- `dfde62633` auto: session update _(2026-06-25)_
- `66a2f707d` fix(web2): split-PBH cancel restocks ALL splits + 5 frontend silent-failure surfaces _(2026-06-24)_
- `03f16bb21` fix(web2): so-order syncRowsToKho surfaces per-item upsert errors (no silent swallow) _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-170704-a90cf11` cho Claude walk chain theo CLAUDE.md protocol.
