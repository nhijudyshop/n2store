# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-150247-e47b0b8`
**Session file**: [`./20260623-150247-e47b0b8.md`](../20260623-150247-e47b0b8.md)
**Commit**: `e47b0b8` — feat(web2-ai): env prefix WEB2* (phân biệt) + ưu tiên Gemini free trước + Cloudflare xoay nhiều account
**Last updated**: 2026-06-23 15:02:47 +07
**Summary**: feat(web2-ai): env prefix WEB2* (phân biệt) + ưu tiên Gemini free trước + Cloudflare xoay nhiều account

## Files changed in this commit (`web2/`)

- `web2/ai-hub/js/ai-keys.js`

## Last 5 commits touching `web2/`

- `e47b0b83d` feat(web2-ai): env prefix WEB2* (phân biệt) + ưu tiên Gemini free trước + Cloudflare xoay nhiều account *(2026-06-23)\_
- `2869d0dd8` feat(web2-cham-cong): 1 nguồn duy nhất = bat → DB (bỏ nút Đồng bộ máy + Nhập Excel/TXT thủ công); client tự lấy data mới qua smart cache + SSE _(2026-06-23)_
- `53ef887dc` feat(web2-cham-cong): dải trạng thái nhận biết PC đồng bộ tắt (stale >15') + hướng dẫn dự phòng (lay-du-lieu.bat / Nhập Excel) _(2026-06-23)_
- `7e7ca83ac` fix(web2-cham-cong): NV gán ưu tiên hơn tên máy (PIN gán Còi → Bảng công hiện 'Còi' không phải 'Coi') _(2026-06-23)_
- `f8012d291` auto: session update _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-150247-e47b0b8` cho Claude walk chain theo CLAUDE.md protocol.
