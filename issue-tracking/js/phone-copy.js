// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Auto-enhance: chèn nút copy bên cạnh mọi SĐT 10 số (\b0\d{9}\b) trên trang issue-tracking.
// Dùng TreeWalker scan text nodes + MutationObserver để bắt cả nội dung render sau.
(function () {
    'use strict';

    const PHONE_RE = /\b0\d{9}\b/g;
    const SKIP_TAGS = new Set([
        'SCRIPT',
        'STYLE',
        'INPUT',
        'TEXTAREA',
        'BUTTON',
        'OPTION',
        'SELECT',
    ]);

    function copyToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise((resolve, reject) => {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    function flashCopied(btn, phone) {
        const originalHTML = btn.innerHTML;
        const originalTitle = btn.title;
        btn.classList.add('copied');
        btn.innerHTML = '✓';
        btn.title = 'Đã copy: ' + phone;
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = originalHTML;
            btn.title = originalTitle;
        }, 1100);
    }

    function shouldSkipNode(node) {
        let p = node.parentNode;
        while (p && p.nodeType === 1) {
            if (SKIP_TAGS.has(p.tagName)) return true;
            if (p.isContentEditable) return true;
            if (p.classList && p.classList.contains('phone-with-copy')) return true;
            p = p.parentNode;
        }
        return false;
    }

    function enhanceTextNode(node) {
        if (!node || node.nodeType !== 3) return;
        const text = node.nodeValue;
        if (!text) return;
        PHONE_RE.lastIndex = 0;
        if (!PHONE_RE.test(text)) return;
        if (shouldSkipNode(node)) return;

        const frag = document.createDocumentFragment();
        let lastIdx = 0;
        let match;
        PHONE_RE.lastIndex = 0;
        while ((match = PHONE_RE.exec(text)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (start > lastIdx) {
                frag.appendChild(document.createTextNode(text.slice(lastIdx, start)));
            }

            const wrap = document.createElement('span');
            wrap.className = 'phone-with-copy';

            const num = document.createElement('span');
            num.className = 'phone-num';
            num.textContent = match[0];
            wrap.appendChild(num);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'phone-copy-btn';
            btn.title = 'Copy SĐT';
            btn.setAttribute('aria-label', 'Copy số điện thoại ' + match[0]);
            btn.dataset.phone = match[0];
            btn.innerHTML =
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
            wrap.appendChild(btn);

            frag.appendChild(wrap);
            lastIdx = end;
        }
        if (lastIdx < text.length) {
            frag.appendChild(document.createTextNode(text.slice(lastIdx)));
        }
        if (node.parentNode) {
            node.parentNode.replaceChild(frag, node);
        }
    }

    function enhanceRoot(root) {
        if (!root) return;
        if (root.nodeType === 3) {
            enhanceTextNode(root);
            return;
        }
        if (root.nodeType !== 1) return;
        if (SKIP_TAGS.has(root.tagName)) return;

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(n) {
                if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
                if (n.nodeValue.length < 10) return NodeFilter.FILTER_REJECT;
                if (!/0\d{9}/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
                if (shouldSkipNode(n)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        const targets = [];
        let n;
        while ((n = walker.nextNode())) targets.push(n);
        targets.forEach(enhanceTextNode);
    }

    document.addEventListener(
        'click',
        (e) => {
            const btn = e.target.closest('.phone-copy-btn');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            const phone = btn.dataset.phone || '';
            if (!phone) return;
            copyToClipboard(phone)
                .then(() => flashCopied(btn, phone))
                .catch(() => {
                    btn.title = 'Copy thất bại';
                });
        },
        true
    );

    let scheduled = false;
    const pendingRoots = new Set();
    function scheduleEnhance() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            const roots = Array.from(pendingRoots);
            pendingRoots.clear();
            roots.forEach(enhanceRoot);
        });
    }

    function startObserving() {
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach((n) => {
                        if (n.nodeType === 1 || n.nodeType === 3) pendingRoots.add(n);
                    });
                } else if (m.type === 'characterData') {
                    pendingRoots.add(m.target);
                }
            }
            if (pendingRoots.size) scheduleEnhance();
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    function init() {
        enhanceRoot(document.body);
        startObserving();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
