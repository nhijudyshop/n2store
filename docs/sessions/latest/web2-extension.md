# Latest Snapshot — `web2-extension/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-163635-e7b5c89`
**Session file**: [`./20260521-163635-e7b5c89.md`](../20260521-163635-e7b5c89.md)
**Commit**: `e7b5c89` — fix(native-orders+ext v2.0.4): Pancake API route cho global_id + m.facebook.com permission
**Last updated**: 2026-05-21 16:36:35 +07
**Summary**: fix(native-orders+ext v2.0.4): Pancake API route cho global_id + m.facebook.com permission

## Files changed in this commit (`web2-extension/`)

- `web2-extension/manifest.json`
- `web2-extension/shared/constants.js`

## Last 5 commits touching `web2-extension/`

- `e7b5c890` fix(native-orders+ext v2.0.4): Pancake API route cho global*id + m.facebook.com permission *(2026-05-21)\_
- `7bac192f` feat(web2-extension): m.facebook.com mobile fallback khi 1545012 cứng đầu _(2026-05-21)_
- `b79f8ee2` auto: session update _(2026-05-21)_
- `4759134e` fix(web2-extension): re-compute jazoest từ fb*dtsg + \_\_comet_req=1 cho Business Suite *(2026-05-21)\_
- `915104f3` auto: session update _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-163635-e7b5c89` cho Claude walk chain theo CLAUDE.md protocol.
