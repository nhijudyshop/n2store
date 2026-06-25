# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-170704-a90cf11`
**Session file**: [`./20260625-170704-a90cf11.md`](../20260625-170704-a90cf11.md)
**Commit**: `a90cf11` — fix(web2): backfill region từ PREFIX MÃ (HN/HC) — note ILIKE chữ Việt không khớp Unicode
**Last updated**: 2026-06-25 17:07:04 +07
**Summary**: live-control TV NCC/Bán/Cọc/Còn + địa danh riêng (region) — fix backfill code-prefix, verify heal 5/5

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-products.js`

## Last 5 commits touching `render.com/`

- `a90cf119b` fix(web2): backfill region từ PREFIX MÃ (HN/HC) — note ILIKE chữ Việt không khớp Unicode _(2026-06-25)_
- `6ddc1a83a` fix(web2): auto-heal region từ note (un-gate migration 080) + random NCC bỏ địa danh _(2026-06-25)_
- `dfde62633` auto: session update _(2026-06-25)_
- `c643b507f` feat(web2/ai-hub): "AI viết mô tả" ở Ghép đồ & HTML Studio xuất tiếng ANH _(2026-06-25)_
- `28cf5a5f2` fix(web2): quét 107 file — 18 nhãn native-cart sót → Giỏ hàng (audit vòng 4) _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-170704-a90cf11` cho Claude walk chain theo CLAUDE.md protocol.
