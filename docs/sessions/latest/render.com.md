# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-231236-b936b17`
**Session file**: [`./20260619-231236-b936b17.md`](../20260619-231236-b936b17.md)
**Commit**: `b936b17` — fix(web2/fb-caption): gọi khách bằng 'chị' (các chị/mấy chị/chị đẹp), tránh 'các bạn'
**Last updated**: 2026-06-19 23:12:36 +07
**Summary**: fix(web2/fb-caption): gọi khách bằng 'chị' (các chị/mấy chị/chị đẹp), tránh 'các bạn'

## Files changed in this commit (`render.com/`)

- `render.com/services/web2-caption-service.js`

## Last 5 commits touching `render.com/`

- `b936b1705` fix(web2/fb-caption): gọi khách bằng 'chị' (các chị/mấy chị/chị đẹp), tránh 'các bạn' _(2026-06-19)_
- `d710a31ae` fix(web2/fb-caption): tông thân thiện — shop xưng em/bọn em/shop, cấm 'chúng tôi' (system prompt + lưới an toàn hậu xử lý) _(2026-06-19)_
- `2c73f6a76` feat(web2/fb): chọn NHIỀU SP từ Kho cho AI (caption tổng hợp + tự thêm ảnh) qua shared Web2ProductPicker; sort page Store→House→Ơi→Nè _(2026-06-19)_
- `d70b709d6` feat(vieneu-tts): installer 1-click Win/Mac + serve.py + tự dò máy online (registry) _(2026-06-19)_
- `e94dbe650` auto: session update _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-231236-b936b17` cho Claude walk chain theo CLAUDE.md protocol.
