// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

(function () {
    // Đăng ký routes
    const R = window.RRouter;
    const V = window.RViews;

    R.register('/', V.viewDashboard, { title: 'Bảng điều khiển', section: 'Tổng quan' });
    R.register('/apartments', V.viewApartments, { title: 'Toà nhà', section: 'BĐS · Toà nhà' });
    R.register('/rooms', V.viewRooms, { title: 'Phòng', section: 'BĐS · Phòng' });
    R.register('/beds', V.viewBeds, { title: 'Giường', section: 'BĐS · Giường' });
    R.register('/apartment-layout', V.viewLayout, {
        title: 'Sơ đồ toà nhà',
        section: 'BĐS · Layout',
    });
    R.register('/locations', V.viewLocations, { title: 'Khu vực', section: 'BĐS · Khu vực' });

    R.register('/leads', V.viewLeads, { title: 'Lead khách thuê', section: 'Khách · Lead' });
    R.register('/reservations', V.viewReservations, { title: 'Đặt cọc', section: 'Khách · Cọc' });
    R.register('/contracts', V.viewContracts, { title: 'Hợp đồng', section: 'Khách · HĐ' });
    R.register('/tenants/active', V.viewTenants, { title: 'Cư dân', section: 'Khách · Cư dân' });
    R.register('/vehicles', V.viewVehicles, { title: 'Phương tiện', section: 'Khách · Xe' });

    R.register('/invoices', V.viewInvoices, { title: 'Hoá đơn', section: 'Tài chính · Hoá đơn' });
    R.register('/income-expenses', V.viewIncomeExpense, {
        title: 'Thu chi',
        section: 'Tài chính · Thu chi',
    });
    R.register('/finance/cash-flow', V.viewCashflow, {
        title: 'Dòng tiền',
        section: 'Tài chính · Dòng tiền',
    });
    R.register('/fees', V.viewFees, { title: 'Khoản thu', section: 'Tài chính · Khoản thu' });
    R.register('/meter-logs', V.viewMeterLogs, {
        title: 'Chỉ số đồng hồ',
        section: 'Tài chính · Đồng hồ',
    });

    R.register('/tasks', V.viewMyTasks, { title: 'Việc của tôi', section: 'Việc · Của tôi' });
    R.register('/tasks/all', V.viewTasks, { title: 'Tất cả công việc', section: 'Việc · Tất cả' });
    R.register('/notifications', V.viewNotifications, {
        title: 'Thông báo',
        section: 'Tổng quan · Notif',
    });

    R.register('/inventory/assets', V.viewAssets, { title: 'Tài sản', section: 'Khác · Tài sản' });
    R.register('/general-setting', V.viewSettings, {
        title: 'Cài đặt',
        section: 'Khác · Settings',
    });
    R.register('/changelog', V.viewChangelog, { title: 'Catalog API', section: 'Khác · Catalog' });

    // Sidebar nav click → set hash
    document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            R.go(el.dataset.route);
            document.getElementById('sidebar').classList.remove('open');
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
        if (tot && (tot.total ?? 0) > 0) {
            document.getElementById('badge-tasks').textContent = tot.total;
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

    // First dispatch
    R.dispatch();
})();
