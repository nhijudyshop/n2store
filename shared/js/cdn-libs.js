// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Lazy CDN library loader. Loads heavy libraries (XLSX, html2canvas) only when first used.
// Saves ~1.1MB initial JS payload on pages that don't immediately need them.
(function () {
    if (window.__cdnLibLoader) return;

    const _promises = {};

    function loadScript(name, url) {
        if (_promises[name]) return _promises[name];
        return (_promises[name] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.async = false;
            s.onload = () => resolve();
            s.onerror = () => {
                delete _promises[name];
                reject(new Error('Failed to load ' + name + ' from ' + url));
            };
            document.head.appendChild(s);
        }));
    }

    window.loadXLSX = function () {
        if (typeof window.XLSX !== 'undefined') return Promise.resolve();
        return loadScript(
            'XLSX',
            'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
        );
    };

    window.loadHtml2Canvas = function () {
        if (typeof window.html2canvas !== 'undefined') return Promise.resolve();
        return loadScript(
            'html2canvas',
            'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
        );
    };

    window.__cdnLibLoader = true;
})();
