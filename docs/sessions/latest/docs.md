# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-104701-34f23fe`
**Session file**: [`./20260630-104701-34f23fe.md`](../20260630-104701-34f23fe.md)
**Commit**: `34f23fe` — fix(live-control): đổi nhãn dropdown 'MỚI theo' → 'Cho VƯỢT theo' (đúng chức năng pre-order, không lọc cột MỚI)
**Last updated**: 2026-06-30 10:47:01 +07
**Summary**: fix(live-control): đổi nhãn dropdown 'MỚI theo' → 'Cho VƯỢT theo' (đúng chức năng pre-order, không l...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `34f23fef2` fix(live-control): đổi nhãn dropdown 'MỚI theo' → 'Cho VƯỢT theo' (đúng chức năng pre-order, không lọc cột MỚI) _(2026-06-30)_
- `81ba9acc3` chore(session): RESUME:20260630-095017-d707c58 _(2026-06-30)_
- `d707c5858` docs(soan-hang): desc thẻ rõ 🖨 = in giấy, tách is*active (ẩn/hiện tag); E2E verified ✅ *(2026-06-30)\_
- `01bdd5cd5` chore(session): RESUME:20260630-094213-79afb75 _(2026-06-30)_
- `79afb759a` fix(soan-hang): tách toggle IN khỏi is*active → cột print_enabled (tag VẪN hiện khi tắt in) *(2026-06-30)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-104701-34f23fe` cho Claude walk chain theo CLAUDE.md protocol.
