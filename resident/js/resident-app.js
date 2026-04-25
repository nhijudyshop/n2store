// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

(function () {
    const R = window.RRouter;
    const V = window.RViews;

    R.register('/', V.viewDashboard, { title: 'Bảng điều khiển', section: 'Tổng quan' });
    R.register('/apartment-layout', V.viewLayout, { title: 'Sơ đồ căn hộ', section: 'Tổng quan' });
    R.register('/notifications', V.viewNotifications, { title: 'Thông báo', section: 'Tổng quan' });

    R.register('/locations', V.viewLocations, { title: 'Khu vực', section: 'Danh mục dữ liệu' });
    R.register('/apartments', V.viewApartments, { title: 'Tòa nhà', section: 'Danh mục dữ liệu' });
    R.register('/rooms', V.viewRooms, { title: 'Căn hộ', section: 'Danh mục dữ liệu' });
    R.register('/beds', V.viewBeds, { title: 'Giường', section: 'Danh mục dữ liệu' });
    R.register('/fees', V.viewFees, { title: 'Dịch vụ', section: 'Danh mục dữ liệu' });
    R.register('/inventory/assets', V.viewAssets, {
        title: 'Tài sản',
        section: 'Danh mục dữ liệu',
    });

    R.register('/leads', V.viewLeads, { title: 'Khách hẹn', section: 'Khách hàng' });
    R.register('/reservations', V.viewReservations, { title: 'Đặt cọc', section: 'Khách hàng' });
    R.register('/contracts', V.viewContracts, { title: 'Hợp đồng', section: 'Khách hàng' });
    R.register('/tenants/active', V.viewTenants, { title: 'Khách hàng', section: 'Khách hàng' });
    R.register('/vehicles', V.viewVehicles, { title: 'Phương tiện', section: 'Khách hàng' });

    R.register('/meter-logs', V.viewMeterLogs, { title: 'Ghi chỉ số', section: 'Tài chính' });
    R.register('/invoices', V.viewInvoices, { title: 'Hóa đơn', section: 'Tài chính' });
    R.register('/income-expenses', V.viewIncomeExpense, { title: 'Thu chi', section: 'Tài chính' });
    R.register('/finance/cash-flow', V.viewCashflow, { title: 'Dòng tiền', section: 'Tài chính' });

    R.register('/tasks/all', V.viewTasks, { title: 'Tất cả công việc', section: 'Công việc' });
    R.register('/tasks', V.viewMyTasks, { title: 'Việc của tôi', section: 'Công việc' });

    R.register('/report/real-estate', V.viewRealEstateReport, {
        title: 'Báo cáo bất động sản',
        section: 'Báo cáo',
    });
    R.register('/report/finance', V.viewFinanceReport, {
        title: 'Báo cáo tài chính',
        section: 'Báo cáo',
    });

    R.register('/general-setting', V.viewSettings, { title: 'Cài đặt chung', section: 'Khác' });
    R.register('/data-catalog', V.viewStub('Danh mục khác'), {
        title: 'Danh mục khác',
        section: 'Khác',
    });
    R.register('/templates', V.viewStub('Mẫu biểu'), { title: 'Mẫu biểu', section: 'Khác' });
    R.register('/staff', V.viewStub('Nhân viên'), { title: 'Nhân viên', section: 'Khác' });
    R.register('/changelog', V.viewChangelog, { title: 'Catalog API', section: 'Khác' });

    // Sidebar nav click
    document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            R.go(el.dataset.route);
            document.getElementById('sidebar').classList.remove('open');
        });
    });

    // Sidebar group toggle
    document.querySelectorAll('.nav-group[data-group]').forEach((el) => {
        el.addEventListener('click', () => {
            const key = el.dataset.group;
            const children = document.querySelector(`[data-children="${key}"]`);
            el.classList.toggle('collapsed');
            if (children) children.classList.toggle('collapsed');
        });
    });

    // Hamburger
    document.getElementById('hamburger').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // Build date
    document.getElementById('build-date').textContent = new Date().toLocaleDateString('vi-VN');

    // Default route
    if (!window.location.hash || window.location.hash === '#') {
        window.location.hash = '#/';
    }

    // Settings + Tasks: sub-tab click → re-render với opts.tab
    document.getElementById('route-body').addEventListener('click', (e) => {
        const stab = e.target.closest('[data-stab]');
        if (stab) {
            // settings tabs
            const key = stab.dataset.stab;
            window.RViews.viewSettings(document.getElementById('route-body'), {}, { tab: key });
        }
        const tab = e.target.closest('[data-tab]');
        if (tab) {
            // status tabs — toggle UI active immediately (data filter sẽ là phần real impl)
            tab.parentElement
                .querySelectorAll('.status-tab')
                .forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
        }
        const trig = e.target.closest('[data-action-trigger]');
        if (trig) {
            const menu = document.getElementById('action-menu');
            const r = trig.getBoundingClientRect();
            menu.style.left = Math.min(r.right - 180, window.innerWidth - 200) + 'px';
            menu.style.top = r.bottom + 4 + 'px';
            menu.hidden = false;
            const close = () => {
                menu.hidden = true;
                document.removeEventListener('click', closeOutside);
            };
            const closeOutside = (ev) => {
                if (!menu.contains(ev.target)) close();
            };
            setTimeout(() => document.addEventListener('click', closeOutside), 0);
        }
    });

    // Quick add button on top bar
    const btnAdd = document.getElementById('btn-add-quick');
    if (btnAdd) btnAdd.addEventListener('click', () => alert('Quick add menu (chưa implement)'));

    // Load user
    (async () => {
        const me = await RData.userMe();
        if (me) {
            document.getElementById('user-name').textContent = me.name || '—';
            document.getElementById('user-email').textContent = me.email || '—';
            document.getElementById('user-avatar').textContent = (me.name || '?')
                .split(' ')
                .pop()
                .charAt(0)
                .toUpperCase();
        }
        const tot = await RData.myTasks();
        const tasksTotal = tot?.total ?? 0;
        if (tasksTotal > 0) {
            document.getElementById('badge-tasks').textContent = tasksTotal;
        } else {
            document.getElementById('badge-tasks').style.display = 'none';
        }
        const cn = await RData.countNotif();
        const cnt = (cn && (cn.total ?? cn.count)) || 0;
        if (cnt > 0) {
            document.getElementById('badge-notif').textContent = cnt;
            document.getElementById('dot-notif').classList.add('on');
        } else {
            document.getElementById('badge-notif').style.display = 'none';
        }
    })();

    R.dispatch();
})();
