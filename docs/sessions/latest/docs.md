# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-210709-36445c0`
**Session file**: [`./20260618-210709-36445c0.md`](../20260618-210709-36445c0.md)
**Commit**: `36445c0` — feat(so-order): Quét mã (camera) + Đọc nhãn (OCR) trong modal Thêm SP — nhập kho từ pack (a/b/c xong)
**Last updated**: 2026-06-18 21:07:09 +07
**Summary**: feat(so-order): Quét mã (camera) + Đọc nhãn (OCR) trong modal Thêm SP — nhập kho từ pack (a/b/c xong)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/CHAT-UNIFICATION-PLAN.md`

## Last 5 commits touching `docs/`

- `36445c0bd` feat(so-order): Quét mã (camera) + Đọc nhãn (OCR) trong modal Thêm SP — nhập kho từ pack (a/b/c xong) _(2026-06-18)_
- `f8bc38181` feat(web2): đếm bó/pack bằng camera opencv.js + chạm sửa tay (Web2PackCounter, Đợt 4) _(2026-06-18)_
- `04e3ed084` feat(web2-customer-chat): Phase 0+1 — layout:'modal' 3-cột Pancake (sidebar tìm kiếm + thread), backward-compat drawer _(2026-06-18)_
- `50c174fe5` feat(web2/label-ocr): thêm chế độ đọc chữ TAY (TrOCR/transformers.js) — toggle Chữ in _(Chữ tay (Đợt 3)|2026-06-18)_
- `49750e02a` chore(session): RESUME:20260618-204429-9544088 _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-210709-36445c0` cho Claude walk chain theo CLAUDE.md protocol.
