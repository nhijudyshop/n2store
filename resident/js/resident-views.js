// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * Views — render từng route. Dùng RHelpers cho filter bar, tabs, table.
 */
(function () {
    const H = window.RHelpers;
    const { fmt, money, esc, kpi, tagFromStatus, filterBar, statusTabs, tableView, pageActions } = H;

    /* ============== DASHBOARD ============== */
    async function viewDashboard(body) {
        const [re, room, contract, invoice, lead, reservation, task, rating, line, top] = await Promise.all([
            RData.realEstateReport(),
            RData.realEstateRoomReport(),
            RData.contractOverview(),
            RData.invoiceOverview(),
            RData.leadOverview(),
            RData.reservationOverview(),
            RData.taskOverview(),
            RData.customerRating(),
            RData.incomeExpenseLineChart(),
            RData.taskTopValues(),
        ]);

        const fb = await filterBar({ location: true, apartment: true });

        const kpis = [
            kpi('Toà nhà', fmt(re?.totalActiveApartments), '', 'k-primary'),
            kpi('Phòng đang hoạt động', fmt(re?.totalActiveRooms), 'Tỉ lệ lấp đầy: ' + (re?.occupancyRate ?? 0) + '%', 'k-info'),
            kpi('Hợp đồng đang hoạt động', fmt(contract?.activeContracts), 'Mới tháng này: ' + fmt(contract?.newContractThisMonth), 'k-accent'),
            kpi('Doanh thu tháng', money(invoice?.totalThisMonth), 'Đã thu: ' + money(invoice?.paidThisMonth), 'k-primary'),
            kpi('HĐ sắp hết hạn', fmt(contract?.expireSoonContracts), '', 'k-warn'),
            kpi('Lead mới tháng', fmt(lead?.newLeadThisMonth), '', 'k-info'),
        ].join('');

        const labels = line?.labels || [];
        const inc = line?.incomeSeries || [];
        const exp = line?.expenseSeries || [];
        const max = Math.max(...inc, ...exp, 1);
        const barsHtml = labels
            .map((lab, i) => {
                const hi = ((inc[i] || 0) / max) * 100;
                const he = ((exp[i] || 0) / max) * 100;
                return `<div class="bar" title="${lab}: thu ${money(inc[i])}, chi ${money(exp[i])}">
            <div style="display:flex;gap:2px;align-items:flex-end;height:140px">
              <div class="bar-fill" style="width:10px;height:${hi}%"></div>
              <div class="bar-fill" style="width:10px;height:${he}%;background:linear-gradient(180deg,#ef4444,#fca5a5)"></div>
            </div>
            <div class="bar-label">${lab}</div></div>`;
            })
            .join('');

        const r = rating || {};
        const totalR = r.totalRating || 1;
        const ratingHtml = [5, 4, 3, 2, 1]
            .map((s) => {
                const idx = ['One', 'Two', 'Three', 'Four', 'Five'][s - 1];
                const pct = +r[`rating${idx}StarPercentage`] || 0;
                const cnt = r[`rating${idx}Star`] || 0;
                return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:6px">
          <span style="width:30px">${s}★</span>
          <div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden">
            <div style="height:100%;background:var(--primary);width:${pct}%"></div></div>
          <span style="width:50px;text-align:right;color:var(--muted)">${cnt} (${pct}%)</span>
        </div>`;
            })
            .join('');

        const renting = +room?.rentingPercentage || 0;

        body.innerHTML = `
      ${fb}
      <h3 class="section-title">Báo cáo bất động sản <span class="pill">Cập nhật ${new Date().toLocaleDateString('vi-VN')}</span></h3>
      <div class="kpi-grid">${kpis}</div>

      <div class="grid-2">
        <div class="card">
          <h3 class="section-title">Doanh thu - Chi phí 12 tháng <span class="pill">VND</span></h3>
          <div class="bar-chart">${barsHtml}</div>
          <div style="display:flex;gap:14px;font-size:12px;color:var(--muted);margin-top:8px">
            <span><span style="display:inline-block;width:10px;height:10px;background:var(--primary);border-radius:2px"></span> Thu</span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px"></span> Chi</span>
          </div>
        </div>
        <div class="card">
          <h3 class="section-title">Tình trạng phòng</h3>
          <div class="donut-grid">
            <div class="donut" style="--p:${renting};--color:var(--primary)"><span class="donut-text">${renting}%</span></div>
            <div class="legend">
              <div class="l"><span class="dot" style="background:var(--primary)"></span>Đang thuê: ${fmt(room?.totalRentingRooms)} (${room?.rentingPercentage}%)</div>
              <div class="l"><span class="dot" style="background:#cbd5e1"></span>Phòng trống: ${fmt(room?.totalEmptyRooms)} (${room?.emptyPercentage}%)</div>
              <div class="l"><span class="dot" style="background:var(--warn)"></span>Đặt cọc: ${fmt(room?.totalDepositRooms)} (${room?.depositPercentage}%)</div>
              <div class="l"><span class="dot" style="background:var(--muted)"></span>Ngừng: ${fmt(room?.totalInActiveRooms)} (${room?.inactivePercentage}%)</div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid-2" style="margin-top:14px">
        <div class="card">
          <h3 class="section-title">Đánh giá khách hàng <span class="pill">${totalR} lượt</span></h3>
          ${ratingHtml}
        </div>
        <div class="card">
          <h3 class="section-title">Top giá trị</h3>
          <div style="font-size:13px;line-height:2">
            <div>🏢 Toà có nhiều việc nhất: <b>${esc(top?.topApartmentName)}</b> (${fmt(top?.topApartmentTaskCount)} việc)</div>
            <div>🚪 Phòng có nhiều việc nhất: <b>${esc(top?.topRoomName)}</b> (${esc(top?.topRoomApartmentName)})</div>
            <div>🛠️ Loại việc phổ biến: <b>${esc(top?.topTaskTypeName)}</b></div>
            <div>👤 Người làm tích cực: <b>${esc(top?.topPerformerName)}</b></div>
          </div>
        </div>
      </div>

      <h3 class="section-title" style="margin-top:18px">Báo cáo tài chính tháng này</h3>
      <div class="kpi-grid">
        ${kpi('Tiền thuê', money(invoice?.totalLease), 'So với tháng trước: ' + (invoice?.compareLease ?? 0) + '%', 'k-primary')}
        ${kpi('Tiền điện', money(invoice?.totalElectricity), '', 'k-warn')}
        ${kpi('Tiền nước', money(invoice?.totalWater), '', 'k-info')}
        ${kpi('Phí khác', money(invoice?.totalOtherFee), '', 'k-accent')}
      </div>
    `;
    }

    /* ============== Apartments ============== */
    async function viewApartments(body) {
        const [list, an] = await Promise.all([RData.apartments(), RData.apartmentAnalytics()]);
        const items = list?.items || [];
        const fb = await filterBar({ location: true, search: 'Tìm tòa nhà...', extras: [{ key: 'active', label: 'Trạng thái', options: [{ value: '', label: 'Tất cả' }, { value: 'true', label: 'Hoạt động' }, { value: 'false', label: 'Ngừng' }] }] });
        body.innerHTML = `
      ${fb}
      <div class="kpi-grid">
        ${kpi('Tổng tòa', fmt(an?.totalActive ?? list?.total), '', 'k-primary')}
        ${kpi('Tổng phòng', fmt(an?.totalActiveRooms), '', 'k-info')}
        ${kpi('Đang trống', fmt(an?.totalEmptyRooms), '', 'k-warn')}
        ${kpi('Đang thuê', fmt(an?.totalRentingRooms), '', 'k-accent')}
      </div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'code', label: 'Mã' },
              { key: 'name', label: 'Tên tòa' },
              { key: 'fullAddress', label: 'Địa chỉ' },
              { key: 'numberRooms', label: 'Số phòng', render: (it) => fmt(it.numberRooms) },
              { key: 'paymentDay', label: 'Ngày thu', render: (it) => fmt(it.paymentDay) || '—' },
              { key: 'active', label: 'Trạng thái', render: (it) => (it.active ? '<span class="tag t-success">Hoạt động</span>' : '<span class="tag t-muted">Ngừng</span>') },
          ],
      })}
    `;
    }

    /* ============== Rooms ============== */
    async function viewRooms(body) {
        const [list, an] = await Promise.all([RData.rooms(), RData.roomAnalytics()]);
        const items = list?.items || [];
        const tabs = [
            { key: 'all', label: 'Tất cả', count: list?.total },
            { key: 'renting', label: 'Đang thuê', count: an?.totalRenting },
            { key: 'empty', label: 'Trống', count: an?.totalEmpty },
            { key: 'deposit', label: 'Đặt cọc', count: an?.totalDeposit },
            { key: 'inactive', label: 'Ngừng', count: an?.totalInActive },
        ];
        const fb = await filterBar({ location: true, apartment: true, search: 'Tìm phòng...' });
        body.innerHTML = `
      ${fb}
      ${statusTabs(tabs, 'all')}
      <div class="kpi-grid">
        ${kpi('Tổng phòng', fmt(list?.total), '', 'k-primary')}
        ${kpi('Đang thuê', fmt(an?.totalRenting ?? '—'), '', 'k-info')}
        ${kpi('Đang trống', fmt(an?.totalEmpty ?? '—'), '', 'k-warn')}
      </div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'code', label: 'Mã phòng' },
              { key: 'name', label: 'Tên' },
              { key: 'apartment', label: 'Tòa', render: (it) => esc(it.apartment?.name) },
              { key: 'floor', label: 'Tầng', render: (it) => esc(it.floor?.name) },
              { key: 'price', label: 'Giá thuê', render: (it) => '<span class="money">' + money(it.price) + '</span>' },
              { key: 'deposit', label: 'Cọc', render: (it) => '<span class="money">' + money(it.deposit) + '</span>' },
              { key: 'size', label: 'DT', render: (it) => fmt(it.size) + ' m²' },
              { key: 'maxTenants', label: 'Sức chứa' },
              { key: 'status', label: 'Trạng thái', render: (it) => tagFromStatus(it.status) },
          ],
      })}`;
    }

    /* ============== Beds ============== */
    async function viewBeds(body) {
        const [list, an] = await Promise.all([RData.beds(), RData.bedAnalytics()]);
        const items = list?.items || [];
        const tabs = [
            { key: 'all', label: 'Tất cả', count: an?.totalActiveBeds },
            { key: 'renting', label: 'Đang thuê', count: an?.totalRentingBeds },
            { key: 'empty', label: 'Trống', count: an?.totalEmptyBeds },
            { key: 'deposit', label: 'Đặt cọc', count: an?.totalDepositBeds },
        ];
        const fb = await filterBar({ location: true, apartment: true, room: true });
        body.innerHTML = `
      ${fb}
      ${statusTabs(tabs, 'all')}
      <div class="kpi-grid">
        ${kpi('Tổng giường', fmt(an?.totalActiveBeds ?? list?.total), '', 'k-primary')}
        ${kpi('Đang thuê', fmt(an?.totalRentingBeds), '', 'k-info')}
        ${kpi('Trống', fmt(an?.totalEmptyBeds), '', 'k-warn')}
      </div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'code', label: 'Mã' },
              { key: 'name', label: 'Tên' },
              { key: 'price', label: 'Giá', render: (it) => money(it.price) },
              { key: 'status', label: 'Trạng thái', render: (it) => tagFromStatus(it.status) },
          ],
          emptyMessage: 'Tòa nhà này không có giường',
      })}`;
    }

    /* ============== Leads ============== */
    async function viewLeads(body) {
        const [list, an] = await Promise.all([RData.leads(), RData.leadAnalytics()]);
        const items = list?.items || [];
        const tabs = [
            { key: 'all', label: 'Tất cả', count: list?.total },
            { key: 'new', label: 'Mới', count: an?.totalNew },
            { key: 'success', label: 'Thành công', count: an?.totalSuccess },
            { key: 'fail', label: 'Thất bại', count: an?.totalFail },
        ];
        const fb = await filterBar({ location: true, apartment: true, daterange: true });
        body.innerHTML = `
      ${fb}
      ${statusTabs(tabs, 'new')}
      <div class="kpi-grid">
        ${kpi('Tổng lead', fmt(list?.total), '', 'k-primary')}
        ${kpi('Mới', fmt(an?.totalNew), '', 'k-info')}
        ${kpi('Thành công', fmt(an?.totalSuccess), '', 'k-accent')}
      </div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'code', label: 'Mã' },
              { key: 'name', label: 'Họ tên' },
              { key: 'phone', label: 'Điện thoại' },
              { key: 'source', label: 'Nguồn', render: (it) => esc(it.source?.name || it.source) },
              { key: 'status', label: 'Trạng thái', render: (it) => tagFromStatus(it.status) },
          ],
          emptyMessage: 'Chưa có lead nào',
      })}`;
    }

    /* ============== Reservations ============== */
    async function viewReservations(body) {
        const [list, an] = await Promise.all([RData.reservations(), RData.reservationAnalytics()]);
        const items = list?.items || [];
        const tabs = [
            { key: 'all', label: 'Tất cả', count: list?.total },
            { key: 'pending', label: 'Đang chờ', count: an?.totalPending },
            { key: 'success', label: 'Hoàn thành', count: an?.totalSuccess },
            { key: 'cancel', label: 'Đã hủy', count: an?.totalCancel },
        ];
        const fb = await filterBar({ location: true, apartment: true, daterange: true });
        body.innerHTML = `
      ${fb}
      ${statusTabs(tabs, 'all')}
      <div class="kpi-grid">
        ${kpi('Tổng đặt cọc', fmt(list?.total), '', 'k-primary')}
        ${kpi('Đang chờ', fmt(an?.totalPending ?? '—'), '', 'k-warn')}
        ${kpi('Hoàn thành', fmt(an?.totalSuccess ?? '—'), '', 'k-info')}
      </div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'code', label: 'Mã' },
              { key: 'tenant', label: 'Khách', render: (it) => esc(it.tenant?.name || it.mainTenant?.name) },
              { key: 'room', label: 'Phòng', render: (it) => esc(it.room?.name) },
              { key: 'depositMoney', label: 'Tiền cọc', render: (it) => money(it.depositMoney) },
              { key: 'reservationDate', label: 'Ngày đặt', render: (it) => esc((it.reservationDate || '').substring(0, 10)) },
              { key: 'status', label: 'Trạng thái', render: (it) => tagFromStatus(it.status) },
          ],
      })}`;
    }

    /* ============== Contracts ============== */
    async function viewContracts(body) {
        const [list, an] = await Promise.all([RData.contracts(), RData.contractAnalytics()]);
        const items = list?.items || [];
        const tabs = [
            { key: 'all', label: 'Tất cả', count: list?.total },
            { key: 'active', label: 'Còn hạn', count: an?.totalActive },
            { key: 'expire-soon', label: 'Sắp hết hạn', count: an?.totalExpireSoon },
            { key: 'leaving', label: 'Sắp chuyển đi', count: an?.totalLeaving },
            { key: 'liquid', label: 'Đã thanh lý', count: an?.totalLiquid },
        ];
        const fb = await filterBar({ location: true, apartment: true, daterange: true });
        body.innerHTML = `
      ${fb}
      ${statusTabs(tabs, 'active')}
      <div class="kpi-grid">
        ${kpi('Tổng HĐ', fmt(list?.total), '', 'k-primary')}
        ${kpi('Đang hoạt động', fmt(an?.totalActive), '', 'k-info')}
        ${kpi('Sắp hết hạn', fmt(an?.totalExpireSoon), '', 'k-warn')}
        ${kpi('Đã thanh lý', fmt(an?.totalLiquid), '', 'k-muted')}
      </div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'code', label: 'Mã HĐ' },
              { key: 'tenant', label: 'Khách', render: (it) => esc(it.name || it.mainTenant?.name) },
              { key: 'room', label: 'Phòng', render: (it) => esc(it.room?.name) },
              { key: 'price', label: 'Tiền thuê', render: (it) => money(it.price) },
              { key: 'startDate', label: 'Bắt đầu', render: (it) => esc((it.startDate || '').substring(0, 10)) },
              { key: 'endDate', label: 'Kết thúc', render: (it) => esc((it.endDate || '').substring(0, 10)) },
              { key: 'remainDays', label: 'Còn lại', render: (it) => (it.remainDays != null ? it.remainDays + ' ngày' : '—') },
              { key: 'statusObject', label: 'Trạng thái', render: (it) => tagFromStatus(it.statusObject) },
          ],
      })}`;
    }

    /* ============== Tenants ============== */
    async function viewTenants(body) {
        const [list, an] = await Promise.all([RData.tenants(), RData.tenantAnalytics()]);
        const items = list?.items || [];
        const tabs = [
            { key: 'living', label: 'Đang thuê', count: an?.totalLiving ?? list?.total },
            { key: 'moved', label: 'Đã chuyển đi', count: an?.totalMoved },
            { key: 'visitor', label: 'Khách vãng lai', count: an?.totalVisitor },
        ];
        const fb = await filterBar({ location: true, apartment: true, search: 'Tìm cư dân...' });
        body.innerHTML = `
      ${fb}
      ${statusTabs(tabs, 'living')}
      <div class="kpi-grid">
        ${kpi('Tổng cư dân', fmt(list?.total), '', 'k-primary')}
        ${kpi('Đang ở', fmt(an?.totalLiving ?? list?.total), '', 'k-info')}
      </div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'name', label: 'Họ tên' },
              { key: 'phone', label: 'Điện thoại' },
              { key: 'idNumber', label: 'CCCD' },
              { key: 'room', label: 'Phòng', render: (it) => esc(it.room?.name) },
              { key: 'apartment', label: 'Tòa', render: (it) => esc(it.apartment?.name) },
              { key: 'gender', label: 'Giới tính', render: (it) => esc(it.gender?.name) },
          ],
      })}`;
    }

    /* ============== Vehicles ============== */
    async function viewVehicles(body) {
        const list = await RData.vehicles();
        const items = list?.items || [];
        const fb = await filterBar({ location: true, apartment: true, search: 'Tìm biển số...' });
        body.innerHTML = `
      ${fb}
      <div class="kpi-grid">${kpi('Tổng phương tiện', fmt(list?.total), '', 'k-primary')}</div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'plateNumber', label: 'Mã PT' },
              { key: 'type', label: 'Loại', render: (it) => esc(it.type?.name) },
              { key: 'tenant', label: 'Cư dân', render: (it) => esc(it.tenant?.name) },
              { key: 'room', label: 'Phòng', render: (it) => esc(it.room?.name) },
              { key: 'apartment', label: 'Tòa', render: (it) => esc(it.apartment?.name) },
          ],
      })}`;
    }

    /* ============== Invoices ============== */
    async function viewInvoices(body) {
        const [list, an] = await Promise.all([RData.invoices(), RData.invoiceAnalytics()]);
        const items = list?.items || [];
        const fb = await filterBar({ location: true, apartment: true, room: true, daterange: true, extras: [{ key: 'paid', label: 'Trạng thái', options: [{ value: '', label: 'Tất cả' }, { value: 'paid', label: 'Đã thu' }, { value: 'unpaid', label: 'Chưa thu' }, { value: 'partial', label: 'Thu một phần' }] }] });
        body.innerHTML = `
      ${fb}
      <div class="kpi-grid">
        ${kpi('Tổng hoá đơn', fmt(list?.total), '', 'k-primary')}
        ${kpi('Tổng tiền', money(an?.totalAmount), '', 'k-info')}
        ${kpi('Đã thu', money(an?.totalPaid), '', 'k-accent')}
        ${kpi('Còn nợ', money(an?.totalUnpaid), '', 'k-warn')}
      </div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'code', label: 'Mã' },
              { key: 'tenant', label: 'Khách', render: (it) => esc(it.mainTenant?.name || it.tenant?.name) },
              { key: 'room', label: 'Phòng', render: (it) => esc(it.room?.name) },
              { key: 'totalAmount', label: 'Tổng', render: (it) => money(it.totalAmount) },
              { key: 'paidAmount', label: 'Đã thu', render: (it) => money(it.paidAmount) },
              { key: 'period', label: 'Kỳ', render: (it) => esc(it.period || it.month) },
              { key: 'status', label: 'Trạng thái', render: (it) => tagFromStatus(it.status) },
          ],
      })}`;
    }

    /* ============== Income-Expense ============== */
    async function viewIncomeExpense(body) {
        const [list, an] = await Promise.all([RData.incomeExpenses(), RData.incomeExpenseAnalytics()]);
        const items = list?.items || [];
        const fb = await filterBar({ daterange: true, location: true, apartment: true, room: true });
        body.innerHTML = `
      ${fb}
      <div class="kpi-grid">
        ${kpi('Tổng thu', money(an?.totalIncome), '', 'k-primary')}
        ${kpi('Tổng chi', money(an?.totalExpense), '', 'k-danger')}
        ${kpi('Số dư', money((an?.totalIncome || 0) - (an?.totalExpense || 0)), '', 'k-accent')}
      </div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'code', label: 'Mã' },
              { key: 'name', label: 'Nội dung' },
              { key: 'amount', label: 'Số tiền', render: (it) => money(it.amount) },
              { key: 'type', label: 'Loại', render: (it) => esc(it.type?.name || it.type) },
              { key: 'cashbook', label: 'Sổ quỹ', render: (it) => esc(it.cashbook?.name) },
              { key: 'date', label: 'Ngày', render: (it) => esc((it.date || '').substring(0, 10)) },
          ],
      })}`;
    }

    /* ============== Cashflow — date-range filter dashboard (live) ============== */
    async function viewCashflow(body) {
        const [cb, ie] = await Promise.all([RData.cashbook(), RData.incomeExpenseLineChart()]);
        const cashbooks = cb?.items || [];
        const totalBalance = cashbooks.reduce((s, c) => s + (c.balance || 0), 0);
        const fb = await filterBar({ daterange: true, location: true, apartment: true, extras: [{ key: 'cashbook', label: 'Chọn sổ quỹ', options: [{ value: '', label: 'Tất cả sổ' }, ...cashbooks.map((c) => ({ value: c.id, label: c.name }))] }] });

        const labels = ie?.labels || [];
        const inc = ie?.incomeSeries || [];
        const exp = ie?.expenseSeries || [];
        const max = Math.max(...inc, ...exp, 1);
        const barsHtml = labels
            .map((lab, i) => {
                const hi = ((inc[i] || 0) / max) * 100;
                const he = ((exp[i] || 0) / max) * 100;
                return `<div class="bar" title="${lab}: thu ${money(inc[i])}, chi ${money(exp[i])}">
            <div style="display:flex;gap:2px;align-items:flex-end;height:140px">
              <div class="bar-fill" style="width:10px;height:${hi}%"></div>
              <div class="bar-fill" style="width:10px;height:${he}%;background:linear-gradient(180deg,#ef4444,#fca5a5)"></div>
            </div>
            <div class="bar-label">${lab}</div></div>`;
            })
            .join('');

        body.innerHTML = `
      ${fb}
      <div class="kpi-grid">
        ${kpi('Tổng số dư', money(totalBalance), 'Trên ' + cashbooks.length + ' sổ quỹ', 'k-primary')}
        ${kpi('Tháng này thu', money(inc[inc.length - 1] || 0), '', 'k-info')}
        ${kpi('Tháng này chi', money(exp[exp.length - 1] || 0), '', 'k-danger')}
      </div>
      <div class="card">
        <h3 class="section-title">Biểu đồ dòng tiền 12 tháng</h3>
        <div class="bar-chart">${barsHtml}</div>
        <div style="display:flex;gap:14px;font-size:12px;color:var(--muted);margin-top:8px">
          <span><span style="display:inline-block;width:10px;height:10px;background:var(--primary);border-radius:2px"></span> Thu</span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px"></span> Chi</span>
        </div>
      </div>
      <div style="margin-top:14px">${tableView({
          total: cashbooks.length,
          items: cashbooks,
          columns: [
              { key: 'name', label: 'Sổ quỹ' },
              { key: 'balance', label: 'Số dư hiện tại', render: (it) => '<span class="money">' + money(it.balance) + '</span>' },
              { key: 'type', label: 'Loại', render: (it) => esc(it.type?.name || it.type) },
              { key: 'active', label: 'Trạng thái', render: (it) => (it.active ? '<span class="tag t-success">Hoạt động</span>' : '<span class="tag t-muted">Ngừng</span>') },
          ],
      })}</div>`;
    }

    /* ============== Fees / Meter / Asset / Locations ============== */
    async function viewFees(body) {
        const list = await RData.fees();
        const items = list?.items || [];
        const fb = await filterBar({ apartment: true, search: 'Tìm dịch vụ...' });
        body.innerHTML = `
      ${fb}
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'code', label: 'Mã' },
              { key: 'name', label: 'Tên dịch vụ' },
              { key: 'price', label: 'Đơn giá', render: (it) => money(it.price) },
              { key: 'unit', label: 'ĐVT', render: (it) => esc(it.unit?.name || it.unit) },
              { key: 'type', label: 'Loại', render: (it) => esc(it.type?.name || it.type) },
          ],
      })}`;
    }

    async function viewMeterLogs(body) {
        const [list, an] = await Promise.all([RData.meterLogs(), RData.meterLogAnalytics()]);
        const items = list?.items || [];
        const fb = await filterBar({ location: true, apartment: true, room: true, daterange: true });
        body.innerHTML = `
      ${fb}
      <div class="kpi-grid">
        ${kpi('Tổng phiếu', fmt(list?.total), '', 'k-primary')}
        ${kpi('Tổng điện', fmt(an?.totalElectricity), '', 'k-warn')}
        ${kpi('Tổng nước', fmt(an?.totalWater), '', 'k-info')}
      </div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'code', label: 'Mã' },
              { key: 'apartment', label: 'Tòa', render: (it) => esc(it.apartment?.name) },
              { key: 'room', label: 'Phòng', render: (it) => esc(it.room?.name) },
              { key: 'meterType', label: 'Loại đồng hồ', render: (it) => esc(it.meterType?.name || it.type) },
              { key: 'beforeIndex', label: 'Chỉ số trước' },
              { key: 'afterIndex', label: 'Chỉ số sau' },
              { key: 'used', label: 'Tiêu thụ', render: (it) => fmt(it.usedQuantity || it.used) },
              { key: 'logDate', label: 'Ngày', render: (it) => esc((it.logDate || '').substring(0, 10)) },
          ],
      })}`;
    }

    async function viewAssets(body) {
        const [list, an] = await Promise.all([RData.assets(), RData.assetAnalytics()]);
        const items = list?.items || [];
        const fb = await filterBar({ apartment: true, room: true, search: 'Tìm tài sản...' });
        body.innerHTML = `
      ${fb}
      <div class="kpi-grid">
        ${kpi('Tổng tài sản', fmt(list?.total), '', 'k-primary')}
        ${kpi('Tổng giá trị', money(an?.totalValue), '', 'k-info')}
      </div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'code', label: 'Mã' },
              { key: 'name', label: 'Tên' },
              { key: 'price', label: 'Giá', render: (it) => money(it.price) },
              { key: 'apartment', label: 'Tòa', render: (it) => esc(it.apartment?.name) },
              { key: 'room', label: 'Phòng', render: (it) => esc(it.room?.name) },
              { key: 'quantity', label: 'SL' },
          ],
      })}`;
    }

    async function viewLocations(body) {
        const list = await RData.locationsSelect();
        const items = list?.items || [];
        body.innerHTML = `
      <div class="kpi-grid">${kpi('Tổng khu vực', fmt(items.length), '', 'k-primary')}</div>
      ${tableView({
          total: items.length,
          items,
          columns: [
              { key: 'code', label: 'Mã' },
              { key: 'name', label: 'Tên khu vực' },
              { key: 'numberApartments', label: 'Số tòa' },
              { key: 'created_at', label: 'Tạo lúc', render: (it) => esc((it.created_at || '').substring(0, 10)) },
          ],
      })}`;
    }

    async function viewLayout(body) {
        const [layout, aps] = await Promise.all([RData.apartmentLayout(), RData.apartmentsAll()]);
        const apartments = aps?.items || [];
        body.innerHTML = `
      <div class="filter-bar">
        <div class="filter"><label>Chọn tòa nhà</label>
          <select data-filter="apartment">${apartments.map((a, i) => `<option value="${esc(a.id)}"${i === 0 ? ' selected' : ''}>${esc(a.code)} - ${esc(a.name)}</option>`).join('')}</select>
        </div>
        <div class="filter-actions"><button class="btn">Làm mới</button></div>
      </div>
      <div class="card">
        <h3 class="section-title">Sơ đồ tòa: <span class="pill">${esc(layout?.apartment?.name || '—')}</span></h3>
        <p style="color:var(--muted);font-size:13px">Số tầng: <b>${fmt(layout?.floors?.length ?? 0)}</b> · Số phòng: <b>${fmt((layout?.floors || []).reduce((s, f) => s + (f.rooms?.length || 0), 0))}</b></p>
        ${(layout?.floors || []).map((f) => `<div style="margin-top:14px"><h4 style="margin:0 0 8px;font-size:13px;color:var(--muted)">${esc(f.name)}</h4><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">${(f.rooms || []).map((r) => `<div style="border:1px solid var(--border);padding:10px;border-radius:8px;background:${r.status?.color ? r.status.color + '22' : 'var(--surface-2)'}"><div style="font-weight:600;font-size:13px">${esc(r.name)}</div><div style="font-size:11px;color:var(--muted)">${esc(r.code || '')}</div>${r.status ? `<div style="margin-top:4px">${tagFromStatus(r.status)}</div>` : ''}</div>`).join('')}</div></div>`).join('')}
      </div>`;
    }

    /* ============== Tasks ============== */
    async function viewTasks(body, params, opts = {}) {
        const [list, an, tot, gr] = await Promise.all([
            RData.tasksAll(),
            RData.taskAnalytics(),
            RData.myTasks(),
            RData.taskGroups(),
        ]);
        const items = list?.items || [];
        const tabs = [
            { key: 'all', label: 'Tất cả', count: list?.total },
            { key: 'mine', label: 'Việc của tôi', count: tot?.total },
            { key: 'watching', label: 'Đang theo dõi', count: tot?.watching },
        ];
        const activeKey = opts.tab || 'all';
        const fb = await filterBar({
            apartment: true,
            room: true,
            extras: [
                { key: 'group', label: 'Nhóm công việc', options: [{ value: '', label: 'Tất cả nhóm' }] },
                { key: 'type', label: 'Loại công việc', options: [{ value: '', label: 'Tất cả loại' }] },
            ],
        });
        body.innerHTML = `
      ${fb}
      ${statusTabs(tabs, activeKey)}
      <div class="kpi-grid">
        ${kpi('Tổng việc', fmt(list?.total), '', 'k-primary')}
        ${kpi('Mới tháng này', fmt(an?.newTasksThisMonth ?? '—'), '', 'k-info')}
        ${kpi('Đang làm', fmt(an?.doingTasks ?? '—'), '', 'k-warn')}
        ${kpi('Hoàn thành', fmt(an?.completedTasks ?? '—'), '', 'k-accent')}
      </div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'code', label: 'Mã' },
              { key: 'title', label: 'Tiêu đề', render: (it) => esc(it.title || it.name) },
              { key: 'taskType', label: 'Loại', render: (it) => esc(it.taskType?.name) },
              { key: 'apartment', label: 'Tòa', render: (it) => esc(it.apartment?.name) },
              { key: 'room', label: 'Phòng', render: (it) => esc(it.room?.name) },
              { key: 'performer', label: 'Người làm', render: (it) => esc(it.performer?.name || it.assignee?.name) },
              { key: 'priority', label: 'Ưu tiên', render: (it) => tagFromStatus(it.priority) },
              { key: 'status', label: 'Trạng thái', render: (it) => tagFromStatus(it.status) },
          ],
      })}`;
    }

    async function viewMyTasks(body, params) { return viewTasks(body, params, { tab: 'mine' }); }

    /* ============== Notifications ============== */
    async function viewNotifications(body) {
        const [list, count] = await Promise.all([RData.notifications(), RData.countNotif()]);
        const items = list?.items || [];
        const fb = await filterBar({ daterange: true, search: 'Tìm thông báo...' });
        body.innerHTML = `
      ${fb}
      <div class="kpi-grid">
        ${kpi('Chưa đọc', fmt(count?.total ?? count?.count ?? 0), '', 'k-warn')}
        ${kpi('Tổng', fmt(list?.total), '', 'k-primary')}
      </div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'code', label: 'Mã' },
              { key: 'content', label: 'Nội dung thông báo', render: (it) => esc((it.content || it.title || '').slice(0, 80)) },
              { key: 'recipientCount', label: 'Số khách hàng nhận', render: (it) => fmt(it.recipientCount || 1) },
              { key: 'channel', label: 'Hình thức gửi', render: (it) => esc(it.channel?.name || it.type?.name || it.type) },
              { key: 'createdAt', label: 'Thời gian', render: (it) => esc((it.createdAt || it.created_at || '').substring(0, 19).replace('T', ' ')) },
              { key: 'status', label: 'Trạng thái', render: (it) => tagFromStatus(it.status) },
          ],
      })}`;
    }

    /* ============== Settings — 6 tabs ============== */
    async function viewSettings(body, params, opts = {}) {
        const [me, perm, conf] = await Promise.all([RData.userMe(), RData.permission(), RData.userConfig()]);
        const tabs = [
            { key: 'basic', label: '⚙️ Cài đặt cơ bản' },
            { key: 'contract', label: '📄 Hợp đồng' },
            { key: 'invoice', label: '🧾 Hóa đơn' },
            { key: 'income', label: '💰 Thu chi' },
            { key: 'notification', label: '🔔 Thông báo' },
            { key: 'integration', label: '🔌 Tích hợp' },
        ];
        const active = opts.tab || 'basic';
        const tabsHtml = tabs.map((t) => `<button class="stab ${t.key === active ? 'active' : ''}" data-stab="${esc(t.key)}">${esc(t.label)}</button>`).join('');

        let main = '';
        if (active === 'basic') {
            main = `
        <div class="card"><h3 class="section-title">Tài khoản</h3>
          <div style="line-height:2;font-size:13px">
            <div>👤 Tên: <b>${esc(me?.name)}</b></div>
            <div>📧 Email: <b>${esc(me?.email)}</b></div>
            <div>📱 Phone: <b>${esc(me?.phone)}</b></div>
            <div>🆔 ID: ${fmt(me?.id)}</div>
            <div>🕒 Đăng nhập gần nhất: ${esc((me?.lastLogin || '').substring(0, 19).replace('T', ' '))}</div>
          </div>
          <div style="margin-top:12px;display:flex;gap:8px">
            <button class="btn primary">Cập nhật</button>
            <button class="btn">Đổi mật khẩu</button>
          </div>
        </div>
        <div class="card" style="margin-top:14px"><h3 class="section-title">User configuration</h3>
          <pre style="background:var(--surface-2);padding:12px;border-radius:6px;font-size:11px;max-height:300px;overflow:auto">${esc(JSON.stringify(conf, null, 2))}</pre>
        </div>`;
        } else if (active === 'contract') {
            main = `<div class="card"><h3 class="section-title">Cấu hình hợp đồng</h3>
          <div style="line-height:2;font-size:13px">
            <div>📅 Ngày thu mặc định trong tháng: <input type="number" value="5" style="width:60px;padding:4px 8px;border:1px solid var(--border);border-radius:4px"></div>
            <div>📑 Mẫu hợp đồng mặc định: <select style="padding:4px 8px;border:1px solid var(--border);border-radius:4px"><option>Mẫu chuẩn</option></select></div>
            <div>⏱️ Cảnh báo HĐ sắp hết hạn (ngày): <input type="number" value="30" style="width:60px;padding:4px 8px;border:1px solid var(--border);border-radius:4px"></div>
          </div>
          <button class="btn primary" style="margin-top:12px">Cập nhật</button>
        </div>`;
        } else if (active === 'invoice') {
            main = `<div class="card"><h3 class="section-title">Cấu hình hóa đơn</h3>
          <div style="line-height:2;font-size:13px">
            <div>📅 Tự động tạo hóa đơn vào ngày: <input type="number" value="1" style="width:60px;padding:4px 8px;border:1px solid var(--border);border-radius:4px"></div>
            <div>📤 Gửi hóa đơn qua: <label><input type="checkbox" checked> SMS</label> <label><input type="checkbox" checked> Zalo</label> <label><input type="checkbox"> Email</label></div>
            <div>💵 Đơn vị tiền tệ: VND</div>
          </div>
          <button class="btn primary" style="margin-top:12px">Cập nhật</button>
        </div>`;
        } else if (active === 'income') {
            main = `<div class="card"><h3 class="section-title">Cấu hình thu chi</h3>
          <div style="line-height:2;font-size:13px">
            <div>📋 Loại thu mặc định: <select style="padding:4px 8px;border:1px solid var(--border);border-radius:4px"><option>Tiền thuê</option></select></div>
            <div>📋 Loại chi mặc định: <select style="padding:4px 8px;border:1px solid var(--border);border-radius:4px"><option>Sửa chữa</option></select></div>
          </div>
          <button class="btn primary" style="margin-top:12px">Cập nhật</button>
        </div>`;
        } else if (active === 'notification') {
            main = `<div class="card"><h3 class="section-title">Cấu hình thông báo</h3>
          <div style="line-height:2;font-size:13px">
            <div><label><input type="checkbox" checked> Nhắc đóng tiền</label></div>
            <div><label><input type="checkbox" checked> HĐ sắp hết hạn</label></div>
            <div><label><input type="checkbox"> Việc cần xử lý</label></div>
            <div><label><input type="checkbox" checked> Có khách mới</label></div>
          </div>
          <button class="btn primary" style="margin-top:12px">Cập nhật</button>
        </div>`;
        } else if (active === 'integration') {
            main = `<div class="card"><h3 class="section-title">Tích hợp ngoài</h3>
          <div style="line-height:2;font-size:13px">
            <div>💬 Zalo OA: <span class="tag t-success">Đã kết nối</span></div>
            <div>🏦 Cổng thanh toán: <span class="tag t-muted">Chưa kết nối</span></div>
            <div>📊 Google Sheets: <span class="tag t-muted">Chưa kết nối</span></div>
          </div>
          <button class="btn primary" style="margin-top:12px">Quản lý kết nối</button>
        </div>
        <div class="card" style="margin-top:14px"><h3 class="section-title">Phân quyền (${fmt(Object.keys(perm || {}).length)} keys)</h3>
          <pre style="background:var(--surface-2);padding:12px;border-radius:6px;font-size:11px;max-height:300px;overflow:auto">${esc(JSON.stringify(perm, null, 2))}</pre>
        </div>`;
        }

        body.innerHTML = `<div class="settings-layout"><div class="settings-side">${tabsHtml}</div><div class="settings-main">${main}</div></div>`;
    }

    /* ============== Catalog (debug page) ============== */
    async function viewChangelog(body) {
        const cat = await RData.catalog();
        body.innerHTML = `
      <div class="card">
        <h3 class="section-title">Mock API catalog <span class="pill">${cat?.length ?? 0} endpoints</span></h3>
        <p style="color:var(--muted);font-size:13px">Bản clone này dùng dữ liệu crawl từ resident.vn ngày <b>${new Date().toLocaleDateString('vi-VN')}</b>.</p>
      </div>
      <div class="table-wrap" style="margin-top:14px">
        <table class="t">
          <thead><tr><th>Method</th><th>Path</th><th>Size</th><th>File</th></tr></thead>
          <tbody>${(cat || [])
              .map((c) => `<tr><td>${esc(c.method)}</td><td><code>${esc(c.path)}</code></td><td>${fmt(c.size)} B</td><td><code>${esc(c.file)}</code></td></tr>`)
              .join('')}</tbody>
        </table>
      </div>`;
    }

    /* ============== Reports ============== */
    async function viewRealEstateReport(body) {
        const [re, room, bed, contract] = await Promise.all([
            RData.realEstateReport(),
            RData.realEstateRoomReport(),
            RData.realEstateBedReport(),
            RData.contractOverview(),
        ]);
        const fb = await filterBar({ location: true, apartment: true, daterange: true });
        body.innerHTML = `
      ${fb}
      <h3 class="section-title">Tổng quan bất động sản</h3>
      <div class="kpi-grid">
        ${kpi('Toà nhà', fmt(re?.totalActiveApartments), '', 'k-primary')}
        ${kpi('Phòng', fmt(re?.totalActiveRooms), '', 'k-info')}
        ${kpi('Giường', fmt(re?.totalActiveBeds), '', 'k-warn')}
        ${kpi('Tỉ lệ lấp đầy', (re?.occupancyRate ?? 0) + '%', '', 'k-accent')}
      </div>
      <h3 class="section-title" style="margin-top:18px">Tình trạng phòng</h3>
      <div class="kpi-grid">
        ${kpi('Đang thuê', fmt(room?.totalRentingRooms), room?.rentingPercentage + '%', 'k-primary')}
        ${kpi('Trống', fmt(room?.totalEmptyRooms), room?.emptyPercentage + '%', 'k-warn')}
        ${kpi('Đặt cọc', fmt(room?.totalDepositRooms), room?.depositPercentage + '%', 'k-info')}
        ${kpi('Ngừng', fmt(room?.totalInActiveRooms), room?.inactivePercentage + '%', 'k-muted')}
      </div>`;
    }

    async function viewFinanceReport(body) {
        const [invoice, ie] = await Promise.all([RData.invoiceOverview(), RData.incomeExpenseLineChart()]);
        const fb = await filterBar({ daterange: true, location: true, apartment: true });
        const labels = ie?.labels || [];
        const inc = ie?.incomeSeries || [];
        const exp = ie?.expenseSeries || [];
        const max = Math.max(...inc, ...exp, 1);
        const barsHtml = labels.map((lab, i) => {
            const hi = ((inc[i] || 0) / max) * 100;
            const he = ((exp[i] || 0) / max) * 100;
            return `<div class="bar"><div style="display:flex;gap:2px;align-items:flex-end;height:140px"><div class="bar-fill" style="width:10px;height:${hi}%"></div><div class="bar-fill" style="width:10px;height:${he}%;background:linear-gradient(180deg,#ef4444,#fca5a5)"></div></div><div class="bar-label">${lab}</div></div>`;
        }).join('');
        body.innerHTML = `
      ${fb}
      <h3 class="section-title">Báo cáo tài chính tháng này</h3>
      <div class="kpi-grid">
        ${kpi('Doanh thu', money(invoice?.totalThisMonth), '', 'k-primary')}
        ${kpi('Đã thu', money(invoice?.paidThisMonth), '', 'k-info')}
        ${kpi('Tiền điện', money(invoice?.totalElectricity), '', 'k-warn')}
        ${kpi('Tiền nước', money(invoice?.totalWater), '', 'k-info')}
      </div>
      <div class="card" style="margin-top:14px"><h3 class="section-title">Doanh thu/Chi 12 tháng</h3>
        <div class="bar-chart">${barsHtml}</div>
      </div>`;
    }

    /* ============== Stub views ============== */
    function viewStub(title) {
        return async (body) => {
            body.innerHTML = `<div class="empty"><div class="ico">🚧</div><h3>${esc(title)}</h3><p>Trang này chưa có data crawl. Có thể bổ sung sau khi browse Tab B (live) qua route tương ứng.</p></div>`;
        };
    }

    window.RViews = {
        viewDashboard,
        viewApartments,
        viewRooms,
        viewBeds,
        viewLeads,
        viewReservations,
        viewContracts,
        viewTenants,
        viewVehicles,
        viewInvoices,
        viewIncomeExpense,
        viewCashflow,
        viewFees,
        viewMeterLogs,
        viewTasks,
        viewMyTasks,
        viewNotifications,
        viewLocations,
        viewAssets,
        viewLayout,
        viewSettings,
        viewChangelog,
        viewRealEstateReport,
        viewFinanceReport,
        viewStub,
    };
})();
