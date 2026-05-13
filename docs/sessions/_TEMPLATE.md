<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# Session Resume — {{TIMESTAMP_HUMAN}}

**Token**: `RESUME:{{TIMESTAMP_TOKEN}}-{{SHA7}}`
**Branch**: `{{BRANCH}}`
**HEAD**: `{{SHA_FULL}}`
**Range**: `{{PREV_SHA7}}..{{SHA7}}` ({{COMMIT_COUNT}} commit(s))
**Author**: {{AUTHOR}}
**Generated**: {{TIMESTAMP_ISO}}

---

## 1. Summary

{{ONE_LINE_SUMMARY}}

<!-- 2-4 câu mở rộng: phiên này đã làm gì, vì sao, kết quả ra sao -->

## 2. Files Modified

<!-- Liệt kê file + ý nghĩa thay đổi, không paste diff. Format:
- `path/to/file.js` — short why
-->

{{FILES_LIST}}

## 3. Key Decisions

<!-- Quyết định kỹ thuật + lý do. Để session sau không phải debate lại.
- Quyết định: ...
  - Lý do: ...
  - Alternative đã reject: ...
-->

## 4. Open Todos / Next Steps

<!-- Phần dở dang hoặc bước tiếp theo cần làm. Cụ thể, actionable.
- [ ] ...
- [ ] ...
-->

## 5. Context Pointers

<!-- File / doc / URL cần đọc để vào việc tiếp. Đặt đường dẫn để Claude Read trực tiếp.
- `docs/...`
- `path/to/code.js:LINE_RANGE`
- External: <URL>
-->

## 6. Notes for Next Session

<!-- Cảnh báo, gotcha, dependency cần check, env state, browser session đang chạy, etc. -->

---

## How to resume

User paste vào chat mới:

```
RESUME:{{TIMESTAMP_TOKEN}}-{{SHA7}}
```

Claude sẽ tự `Read` file này, tóm tắt 2-3 câu để xác nhận hiểu đúng, rồi tiếp tục từ phần "Next Steps".
