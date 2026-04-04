// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// api-service.js (WRAPPER)
// Re-exports shared ApiService for ES module consumers.
// Actual implementation: ../shared/js/api-service.js (loaded via <script> tag in index.html)
export default window.ApiService;
