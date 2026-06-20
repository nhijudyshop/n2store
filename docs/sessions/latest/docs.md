# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-195827-8bc94ed`
**Session file**: [`./20260620-195827-8bc94ed.md`](../20260620-195827-8bc94ed.md)
**Commit**: `8bc94ed` — feat(live-chat): picker livestream chọn chiến dịch cha HOẶC bài live (multi-select); fix(native-orders): 401 chiến dịch cha thiếu x-web2-token
**Last updated**: 2026-06-20 19:58:27 +07
**Summary**: live-chat picker chiến dịch cha/bài live + fix native-orders 401

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `8bc94ed16` feat(live-chat): picker livestream chọn chiến dịch cha HOẶC bài live (multi-select); fix(native-orders): 401 chiến dịch cha thiếu x-web2-token _(2026-06-20)_
- `f75614801` feat(live-chat): chat.html tab Livestream theo chiến dịch + sub-filter tin nhắn/bình luận + fix overlap _(2026-06-20)_
- `9c16b433f` chore(session): RESUME:20260620-194138-a9cfb54 _(2026-06-20)_
- `481b1364f` fix(vieneu-tts): PS1 cài giọng vỡ parse 'Unexpected token }' — bỏ em-dash trong string literal + thêm UTF-8 BOM _(2026-06-20)_
- `749709e58` chore(session): RESUME:20260620-192116-3e3021e _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-195827-8bc94ed` cho Claude walk chain theo CLAUDE.md protocol.
