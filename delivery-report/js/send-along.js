// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// Gửi Kèm — nhập "đơn gửi kèm" cho trang Thống Kê Giao Hàng (delivery-report).
// - Mỗi KÊNH GỬI (dropdown cố định) chứa nhiều ĐƠN: Tên - SĐT (5-10 số) - Giá trị.
// - Dấu "+" ngoài ô → thêm kênh mới. Dấu "+" trong ô kênh → thêm đơn cho kênh đó.
// - Dữ liệu lưu theo TỪNG NGÀY (ngày lọc hiện tại của tra soát):
//     Firestore: delivery_report/data/send_along/<dateKey>  (source of truth)
//     localStorage: dr_send_along_v1[<dateKey>]             (cache offline)
// Web 1.0 module — KHÔNG dùng web2 pool/topic. Firestore OK cho Web 1.0.

(function () {
    'use strict';

    const LS_KEY = 'dr_send_along_v1';
    // Danh sách kênh gửi cố định. Cần thêm kênh → sửa mảng này.
    const CHANNELS = [
        'TOMATO',
        'NAP',
        'Thành phố',
        'GHTK',
        'GHN',
        'Viettel Post',
        'J&T Express',
        'SPX (Shopee Express)',
        'Ahamove',
        'Grab',
        'Xe khách',
        'Bưu điện',
        'Khác',
    ];

    // In-memory state cho ngày đang mở.
    // channels: [{ channel: string, orders: [{ name, phone, value }] }]
    let _state = { dateKey: '', channels: [] };

    // ---------- Firestore ----------
    function getDB() {
        if (typeof getFirestore === 'function') return getFirestore();
        if (typeof firebase !== 'undefined' && firebase.apps?.length) return firebase.firestore();
        return null;
    }
    function getDocRef(dateKey) {
        const db = getDB();
        if (!db) return null;
        return db
            .collection('delivery_report')
            .doc('data')
            .collection('send_along')
            .doc(dateKey);
    }

    // ---------- Date key ----------
    // Theo ngày lọc hiện tại của tra soát. Single-day → "YYYY-MM-DD".
    // Nếu chọn khoảng → "YYYY-MM-DD__YYYY-MM-DD".
    function currentDateKey() {
        const from = document.getElementById('drFilterFromDate')?.value || '';
        const to = document.getElementById('drFilterToDate')?.value || '';
        if (!from && !to) return new Date().toISOString().slice(0, 10);
        if (!to || from === to) return from || to;
        return `${from}__${to}`;
    }
    function dateKeyLabel(key) {
        const fmt = (s) => {
            const [y, m, d] = (s || '').split('-');
            return d ? `${d}/${m}/${y}` : s;
        };
        if (key.includes('__')) {
            const [a, b] = key.split('__');
            return `${fmt(a)} → ${fmt(b)}`;
        }
        return fmt(key);
    }

    // ---------- localStorage cache ----------
    function loadLocal(dateKey) {
        try {
            const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
            const entry = all[dateKey];
            if (entry && Array.isArray(entry.channels)) return entry.channels;
        } catch (_) {}
        return null;
    }
    function saveLocal(dateKey, channels) {
        try {
            const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
            all[dateKey] = { channels, updatedAt: Date.now() };
            localStorage.setItem(LS_KEY, JSON.stringify(all));
        } catch (_) {}
    }

    // ---------- Value helpers ----------
    function parseValue(raw) {
        const digits = String(raw || '').replace(/[^\d]/g, '');
        return digits ? parseInt(digits, 10) : 0;
    }
    function formatValue(n) {
        return Number(n || 0).toLocaleString('vi-VN');
    }
    function isValidPhone(raw) {
        const digits = String(raw || '').replace(/[^\d]/g, '');
        return digits.length >= 5 && digits.length <= 10;
    }

    // ---------- DOM build (modal injected once) ----------
    function ensureModal() {
        if (document.getElementById('saModal')) return;
        const overlay = document.createElement('div');
        overlay.className = 'sa-modal-overlay';
        overlay.id = 'saModal';
        overlay.innerHTML = `
            <div class="sa-modal" role="dialog" aria-modal="true" aria-labelledby="saModalTitle">
                <div class="sa-modal-header">
                    <h3 id="saModalTitle"><i class="fas fa-box"></i> Gửi Kèm
                        <span class="sa-modal-date" id="saModalDate"></span>
                    </h3>
                    <button class="sa-modal-close" type="button" aria-label="Đóng"
                        onclick="SendAlong.close()">&times;</button>
                </div>
                <div class="sa-modal-body">
                    <div id="saChannels"></div>
                    <button type="button" class="sa-add-channel" onclick="SendAlong.addChannel()">
                        <i class="fas fa-plus"></i> Thêm kênh
                    </button>
                </div>
                <div class="sa-modal-footer">
                    <div class="sa-grand-total">Tổng cộng: <span id="saGrandTotal">0</span></div>
                    <div style="display:flex; gap:8px; align-items:center">
                        <span class="sa-status" id="saStatus"></span>
                        <button type="button" class="dr-btn dr-btn-primary" onclick="SendAlong.save()">
                            <i class="fas fa-save"></i> Lưu
                        </button>
                        <button type="button" class="dr-btn" style="background:#e5e7eb;color:#374151"
                            onclick="SendAlong.close()">Đóng</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        // Click backdrop → đóng
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) close();
        });
    }

    function channelOptionsHtml(selected) {
        const opts = ['<option value="">-- Chọn kênh --</option>'];
        for (const c of CHANNELS) {
            const sel = c === selected ? ' selected' : '';
            opts.push(`<option value="${escapeHtml(c)}"${sel}>${escapeHtml(c)}</option>`);
        }
        return opts.join('');
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function render() {
        ensureModal();
        document.getElementById('saModalDate').textContent =
            'Ngày ' + dateKeyLabel(_state.dateKey);
        const container = document.getElementById('saChannels');
        if (!_state.channels.length) {
            container.innerHTML =
                '<div class="sa-empty">Chưa có kênh nào. Bấm "Thêm kênh" để bắt đầu.</div>';
            updateGrandTotal();
            return;
        }
        container.innerHTML = _state.channels.map((ch, ci) => channelHtml(ch, ci)).join('');
        updateGrandTotal();
    }

    function channelHtml(ch, ci) {
        const rows = (ch.orders || [])
            .map(
                (o, oi) => `
            <div class="sa-order-row" data-ci="${ci}" data-oi="${oi}">
                <input type="text" class="sa-input-name" placeholder="Tên"
                    value="${escapeHtml(o.name)}"
                    oninput="SendAlong._edit(${ci},${oi},'name',this.value)">
                <input type="text" class="sa-input-phone" placeholder="SĐT (5-10 số)"
                    inputmode="numeric" maxlength="10" value="${escapeHtml(o.phone)}"
                    oninput="SendAlong._editPhone(${ci},${oi},this)">
                <input type="text" class="sa-input-value" placeholder="Giá trị"
                    inputmode="numeric" value="${o.value ? formatValue(o.value) : ''}"
                    oninput="SendAlong._editValue(${ci},${oi},this)">
                <button type="button" class="sa-btn-icon" title="Xóa đơn"
                    onclick="SendAlong.removeOrder(${ci},${oi})">&times;</button>
            </div>`
            )
            .join('');
        const total = (ch.orders || []).reduce((s, o) => s + parseValue(o.value), 0);
        return `
        <div class="sa-channel" data-ci="${ci}">
            <div class="sa-channel-head">
                <label>Kênh gửi:</label>
                <select class="sa-channel-select"
                    onchange="SendAlong._editChannel(${ci},this.value)">
                    ${channelOptionsHtml(ch.channel)}
                </select>
                <span class="sa-channel-total">${formatValue(total)}</span>
                <button type="button" class="sa-btn-icon" title="Xóa kênh"
                    onclick="SendAlong.removeChannel(${ci})">&times;</button>
            </div>
            <div class="sa-orders">${rows}</div>
            <button type="button" class="sa-add-order" onclick="SendAlong.addOrder(${ci})">
                <i class="fas fa-plus"></i> Thêm đơn
            </button>
        </div>`;
    }

    function updateGrandTotal() {
        const grand = _state.channels.reduce(
            (s, ch) => s + (ch.orders || []).reduce((t, o) => t + parseValue(o.value), 0),
            0
        );
        const el = document.getElementById('saGrandTotal');
        if (el) el.textContent = formatValue(grand);
    }

    function updateChannelTotal(ci) {
        const card = document.querySelector(`.sa-channel[data-ci="${ci}"]`);
        if (!card) return;
        const total = (_state.channels[ci]?.orders || []).reduce(
            (s, o) => s + parseValue(o.value),
            0
        );
        const el = card.querySelector('.sa-channel-total');
        if (el) el.textContent = formatValue(total);
    }

    // ---------- Public actions ----------
    function open() {
        const dateKey = currentDateKey();
        _state = { dateKey, channels: [] };
        ensureModal();
        // Load cache trước để hiển thị ngay
        const cached = loadLocal(dateKey);
        if (cached) _state.channels = deepClone(cached);
        render();
        document.getElementById('saModal').classList.add('show');
        setStatus('');
        // Firestore source-of-truth (override cache nếu có)
        loadFromFirestore(dateKey);
    }

    async function loadFromFirestore(dateKey) {
        const ref = getDocRef(dateKey);
        if (!ref) return;
        try {
            const snap = await ref.get();
            if (snap.exists && _state.dateKey === dateKey) {
                const data = snap.data() || {};
                if (Array.isArray(data.channels)) {
                    _state.channels = deepClone(data.channels);
                    saveLocal(dateKey, _state.channels);
                    render();
                }
            }
        } catch (e) {
            console.warn('[send-along] loadFromFirestore failed:', e?.message);
        }
    }

    function close() {
        document.getElementById('saModal')?.classList.remove('show');
    }

    function addChannel() {
        _state.channels.push({ channel: '', orders: [{ name: '', phone: '', value: 0 }] });
        render();
    }

    function removeChannel(ci) {
        _state.channels.splice(ci, 1);
        render();
    }

    function addOrder(ci) {
        if (!_state.channels[ci]) return;
        (_state.channels[ci].orders ||= []).push({ name: '', phone: '', value: 0 });
        render();
    }

    function removeOrder(ci, oi) {
        if (!_state.channels[ci]) return;
        _state.channels[ci].orders.splice(oi, 1);
        render();
    }

    // Inline edits — KHÔNG re-render (giữ focus), chỉ cập nhật state + total.
    function _editChannel(ci, value) {
        if (_state.channels[ci]) _state.channels[ci].channel = value;
    }
    function _edit(ci, oi, field, value) {
        const o = _state.channels[ci]?.orders?.[oi];
        if (o) o[field] = value;
    }
    function _editPhone(ci, oi, input) {
        const digits = input.value.replace(/[^\d]/g, '').slice(0, 10);
        input.value = digits;
        const o = _state.channels[ci]?.orders?.[oi];
        if (o) o.phone = digits;
        input.classList.toggle('sa-invalid', digits.length > 0 && !isValidPhone(digits));
    }
    function _editValue(ci, oi, input) {
        const n = parseValue(input.value);
        input.value = n ? formatValue(n) : '';
        const o = _state.channels[ci]?.orders?.[oi];
        if (o) o.value = n;
        updateChannelTotal(ci);
        updateGrandTotal();
    }

    function setStatus(msg, color) {
        const el = document.getElementById('saStatus');
        if (el) {
            el.textContent = msg || '';
            el.style.color = color || '#6b7280';
        }
    }

    function validate() {
        for (let ci = 0; ci < _state.channels.length; ci++) {
            const ch = _state.channels[ci];
            if (!ch.channel) return 'Vui lòng chọn kênh gửi cho tất cả các ô.';
            for (const o of ch.orders || []) {
                const hasAny = o.name || o.phone || o.value;
                if (!hasAny) continue;
                if (o.phone && !isValidPhone(o.phone))
                    return `Kênh "${ch.channel}": SĐT phải từ 5-10 số.`;
            }
        }
        return null;
    }

    function sanitize() {
        // Bỏ đơn rỗng hoàn toàn; bỏ kênh không còn đơn.
        return _state.channels
            .map((ch) => ({
                channel: ch.channel,
                orders: (ch.orders || []).filter((o) => o.name || o.phone || o.value),
            }))
            .filter((ch) => ch.channel && ch.orders.length);
    }

    async function save() {
        const err = validate();
        if (err) {
            setStatus(err, '#ef4444');
            return;
        }
        const dateKey = _state.dateKey;
        const channels = sanitize();
        // UI-first: cache + đóng cảm giác ngay, Firestore nền.
        saveLocal(dateKey, channels);
        setStatus('Đang lưu...', '#6b7280');
        const ref = getDocRef(dateKey);
        if (!ref) {
            setStatus('Đã lưu cục bộ (Firestore không sẵn sàng).', '#b45309');
            return;
        }
        try {
            await ref.set(
                { dateKey, channels, updatedAt: Date.now() },
                { merge: false }
            );
            setStatus('Đã lưu ✓', '#16a34a');
            setTimeout(() => close(), 600);
        } catch (e) {
            console.warn('[send-along] save Firestore failed:', e?.message);
            setStatus('Lưu cục bộ OK, đồng bộ lỗi: ' + (e?.message || ''), '#ef4444');
        }
    }

    function deepClone(arr) {
        try {
            return JSON.parse(JSON.stringify(arr));
        } catch (_) {
            return [];
        }
    }

    window.SendAlong = {
        open,
        close,
        addChannel,
        removeChannel,
        addOrder,
        removeOrder,
        save,
        _editChannel,
        _edit,
        _editPhone,
        _editValue,
    };
})();
