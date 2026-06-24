# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-113131-8427499`
**Session file**: [`./20260624-113131-8427499.md`](../20260624-113131-8427499.md)
**Commit**: `8427499` — docs(dev-log): bg-remover server (tách nền máy shop, VieNeu pattern)
**Last updated**: 2026-06-24 11:31:31 +07
**Summary**: fix web2/users: perms tab scroll + đổi mật khẩu modal Sửa + hiện MK cột

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-vieneu-registry.js`
- `render.com/services/web2-ai-service.js`

## Last 5 commits touching `render.com/`

- `302b54408` fix(web2): VieNeu registry -> Postgres (fix multi-instance) + ChatAnywhere provider + preset thumbnails _(2026-06-24)_
- `00347f3cd` feat(web2/ai-hub): tách key chat/Nano Banana + gate quyền + quota + lưu ảnh/prompt/chat + thư viện mẫu _(2026-06-24)_
- `dddf5f64a` feat(web2): ai-hub 'Ghép đồ / Thử đồ' — 1 person + N garment images + scene prompt → Gemini multi-image composite _(2026-06-24)_
- `9294b1db7` fix(web2): footer avatar missing on some pages + ai-hub provider/model cleanup + English AI prompts _(2026-06-24)_
- `d9128071c` feat(web2): complete permission system — registry 18→49 pages + auto-discover + safe enforcement _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-113131-8427499` cho Claude walk chain theo CLAUDE.md protocol.
