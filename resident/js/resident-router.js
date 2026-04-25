// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * Hash router. Chuyển window.location.hash → route handler đăng ký.
 * Routes mặc định mapped giống resident.vn.
 */
(function () {
    const routes = new Map();

    function register(path, handler, meta = {}) {
        routes.set(path, { handler, meta });
    }

    function parseHash() {
        const h = (window.location.hash || '#/').replace(/^#/, '');
        const [path, qs] = h.split('?');
        const params = {};
        if (qs) {
            for (const part of qs.split('&')) {
                const [k, v = ''] = part.split('=');
                params[decodeURIComponent(k)] = decodeURIComponent(v);
            }
        }
        return { path: path || '/', params };
    }

    async function dispatch() {
        const { path, params } = parseHash();
        const route = routes.get(path);
        const body = document.getElementById('route-body');
        const title = document.getElementById('route-title');
        const breadcrumb = document.getElementById('breadcrumb');

        // active sidebar
        document.querySelectorAll('.nav-item').forEach((el) => {
            el.classList.toggle('active', el.dataset.route === path);
        });

        if (!route) {
            body.innerHTML =
                '<div class="empty"><div class="ico">🚧</div>Route <code>' +
                path +
                '</code> chưa có handler.</div>';
            title.textContent = 'Không tìm thấy';
            breadcrumb.textContent = 'Resident · ' + path;
            return;
        }
        title.textContent = route.meta.title || path;
        breadcrumb.textContent = 'Resident · ' + (route.meta.section || path);
        body.innerHTML = '<div class="skeleton">Đang tải dữ liệu mock…</div>';
        try {
            await route.handler(body, params);
        } catch (e) {
            body.innerHTML =
                '<div class="empty"><div class="ico">⚠️</div>Lỗi: ' + e.message + '</div>';
            console.error(e);
        }
    }

    function go(path) {
        window.location.hash = '#' + path;
    }

    window.RRouter = { register, dispatch, go, parseHash };
    window.addEventListener('hashchange', dispatch);
})();
