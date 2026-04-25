// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * Views — render từng route. Tất cả render dùng innerHTML escape thủ công.
 */
(function () {
    const fmt = (n) =>
        typeof n === 'number' ? n.toLocaleString('vi-VN') : n == null ? '—' : String(n);
    const money = (n) => (typeof n === 'number' ? n.toLocaleString('vi-VN') + 'đ' : '—');
    const esc = (s) =>
        String(s ?? '').replace(
            /[&<>"']/g,
            (c) =>
                ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                })[c]
        );

    function kpi(label, value, sub, cls = '') {
        return `<div class="kpi ${cls}"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${value}</div>${sub ? '<div class="kpi-sub">' + sub + '</div>' : ''}</div>`;
    }

    function tagFromStatus(s) {
        if (!s) return '';
        const v = s.variant || '';
        const cls =
            v === 'primary'
                ? 't-success'
                : v === 'warn'
                  ? 't-warn'
                  : v === 'info'
                    ? 't-info'
                    : 't-muted';
        return `<span class="tag ${cls}">${esc(s.title || '')}</span>`;
    }

    /* ============== DASHBOARD ============== */
    async function viewDashboard(body) {
        const [re, room, contract, invoice, lead, reservation, task, rating, line, top] =
            await Promise.all([
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

        const kpis = [
            kpi('Toà nhà', fmt(re?.totalActiveApartments), '', 'k-primary'),
            kpi(
                'Phòng đang hoạt động',
                fmt(re?.totalActiveRooms),
                'Tỉ lệ lấp đầy: ' + (re?.occupancyRate ?? 0) + '%',
                'k-info'
            ),
            kpi(
                'Hợp đồng đang hoạt động',
                fmt(contract?.activeContracts),
                'Mới tháng này: ' + fmt(contract?.newContractThisMonth),
                'k-accent'
            ),
            kpi(
                'Doanh thu tháng',
                money(invoice?.totalThisMonth),
                'Đã thu: ' + money(invoice?.paidThisMonth),
                'k-primary'
            ),
            kpi('HĐ sắp hết hạn', fmt(contract?.expireSoonContracts), '', 'k-warn'),
            kpi('Lead mới tháng', fmt(lead?.newLeadThisMonth), '', 'k-info'),
        ].join('');

        // Donut: room status
        const totalRooms = room?.totalActiveRooms || 0 || 1;
        const renting = +room?.rentingPercentage || 0;

        // Line chart bars (income vs expense)
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

        // rating
        const r = rating || {};
        const totalR = r.totalRating || 1;
        const ratingHtml = [5, 4, 3, 2, 1]
            .map((s) => {
                const pct =
                    +r[`rating${['One', 'Two', 'Three', 'Four', 'Five'][s - 1]}StarPercentage`] ||
                    0;
                const cnt = r[`rating${['One', 'Two', 'Three', 'Four', 'Five'][s - 1]}Star`] || 0;
                return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:6px">
          <span style="width:30px">${s}★</span>
          <div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden">
            <div style="height:100%;background:var(--primary);width:${pct}%"></div></div>
          <span style="width:50px;text-align:right;color:var(--muted)">${cnt} (${pct}%)</span>
        </div>`;
            })
            .join('');

        body.innerHTML = `
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
    `;
    }

    /* ============== List rendering helper ============== */
    function tableView(opts) {
        const { columns, items, total, toolbar = '' } = opts;
        if (!items?.length) {
            return `<div class="table-wrap"><div class="empty"><div class="ico">📭</div>Chưa có dữ liệu</div></div>`;
        }
        const head = columns.map((c) => `<th>${esc(c.label)}</th>`).join('');
        const rows = items
            .map(
                (it) =>
                    '<tr>' +
                    columns
                        .map((c) => '<td>' + (c.render ? c.render(it) : esc(it[c.key])) + '</td>')
                        .join('') +
                    '</tr>'
            )
            .join('');
        return `<div class="table-wrap">
      <div class="table-toolbar">
        <div class="total">Hiển thị ${items.length} / ${fmt(total ?? items.length)}</div>
        <div class="right">${toolbar}<button class="btn primary">+ Thêm</button></div>
      </div>
      <table class="t"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    </div>`;
    }

    /* ============== Apartments ============== */
    async function viewApartments(body) {
        const [list, an] = await Promise.all([RData.apartments(), RData.apartmentAnalytics()]);
        const items = list?.items || [];
        body.innerHTML = `
      <div class="kpi-grid">
        ${kpi('Tổng toà', fmt(an?.totalActive ?? list?.total), '', 'k-primary')}
        ${kpi('Tổng phòng', fmt(an?.totalActiveRooms), '', 'k-info')}
        ${kpi('Đang trống', fmt(an?.totalEmptyRooms), '', 'k-warn')}
        ${kpi('Đang thuê', fmt(an?.totalRentingRooms), '', 'k-accent')}
      </div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'code', label: 'Mã' },
              { key: 'name', label: 'Tên' },
              { key: 'fullAddress', label: 'Địa chỉ' },
              { key: 'numberRooms', label: 'Số phòng', render: (it) => fmt(it.numberRooms) },
              { key: 'paymentDay', label: 'Ngày thu', render: (it) => fmt(it.paymentDay) || '—' },
              {
                  key: 'active',
                  label: 'Trạng thái',
                  render: (it) =>
                      it.active
                          ? '<span class="tag t-success">Hoạt động</span>'
                          : '<span class="tag t-muted">Ngừng</span>',
              },
          ],
      })}
    `;
    }

    /* ============== Rooms ============== */
    async function viewRooms(body) {
        const [list, an] = await Promise.all([RData.rooms(), RData.roomAnalytics()]);
        const items = list?.items || [];
        body.innerHTML = `
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
              { key: 'apartment', label: 'Toà', render: (it) => esc(it.apartment?.name) },
              { key: 'floor', label: 'Tầng', render: (it) => esc(it.floor?.name) },
              {
                  key: 'price',
                  label: 'Giá thuê',
                  render: (it) => '<span class="money">' + money(it.price) + '</span>',
              },
              {
                  key: 'deposit',
                  label: 'Cọc',
                  render: (it) => '<span class="money">' + money(it.deposit) + '</span>',
              },
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
        body.innerHTML = `
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
      })}`;
    }

    /* ============== Leads / Reservations / Contracts ============== */
    async function viewLeads(body) {
        const [list, an] = await Promise.all([RData.leads(), RData.leadAnalytics()]);
        const items = list?.items || [];
        body.innerHTML = `
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
              { key: 'name', label: 'Tên' },
              { key: 'phone', label: 'Điện thoại' },
              { key: 'source', label: 'Nguồn' },
              { key: 'status', label: 'Trạng thái', render: (it) => tagFromStatus(it.status) },
          ],
      })}`;
    }

    async function viewReservations(body) {
        const [list, an] = await Promise.all([RData.reservations(), RData.reservationAnalytics()]);
        const items = list?.items || [];
        body.innerHTML = `
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
              {
                  key: 'tenant',
                  label: 'Khách',
                  render: (it) => esc(it.tenant?.name || it.tenantName),
              },
              { key: 'room', label: 'Phòng', render: (it) => esc(it.room?.name || it.roomName) },
              { key: 'depositMoney', label: 'Tiền cọc', render: (it) => money(it.depositMoney) },
              {
                  key: 'reservationDate',
                  label: 'Ngày đặt',
                  render: (it) => esc(it.reservationDate),
              },
              { key: 'status', label: 'Trạng thái', render: (it) => tagFromStatus(it.status) },
          ],
      })}`;
    }

    async function viewContracts(body) {
        const [list, an] = await Promise.all([RData.contracts(), RData.contractAnalytics()]);
        const items = list?.items || [];
        body.innerHTML = `
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
              {
                  key: 'tenant',
                  label: 'Khách',
                  render: (it) => esc(it.mainTenant?.name || it.tenant?.name || ''),
              },
              { key: 'room', label: 'Phòng', render: (it) => esc(it.room?.name || '') },
              { key: 'rentMoney', label: 'Tiền thuê', render: (it) => money(it.rentMoney) },
              {
                  key: 'startDate',
                  label: 'Bắt đầu',
                  render: (it) => esc((it.startDate || '').substring(0, 10)),
              },
              {
                  key: 'endDate',
                  label: 'Kết thúc',
                  render: (it) => esc((it.endDate || '').substring(0, 10)),
              },
              {
                  key: 'status',
                  label: 'Trạng thái',
                  render: (it) => tagFromStatus(it.contractStatus || it.status),
              },
          ],
      })}`;
    }

    /* ============== Tenants / Vehicles ============== */
    async function viewTenants(body) {
        const [list, an] = await Promise.all([RData.tenants(), RData.tenantAnalytics()]);
        const items = list?.items || [];
        body.innerHTML = `
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
              { key: 'apartment', label: 'Toà', render: (it) => esc(it.apartment?.name) },
              { key: 'gender', label: 'Giới tính', render: (it) => esc(it.gender?.name) },
          ],
      })}`;
    }

    async function viewVehicles(body) {
        const list = await RData.vehicles();
        const items = list?.items || [];
        body.innerHTML = tableView({
            total: list?.total,
            items,
            columns: [
                { key: 'plateNumber', label: 'Biển số' },
                { key: 'type', label: 'Loại', render: (it) => esc(it.type?.name) },
                { key: 'tenant', label: 'Cư dân', render: (it) => esc(it.tenant?.name) },
                { key: 'room', label: 'Phòng', render: (it) => esc(it.room?.name) },
                { key: 'apartment', label: 'Toà', render: (it) => esc(it.apartment?.name) },
            ],
        });
    }

    /* ============== Invoices / Income-Expense / Cashflow ============== */
    async function viewInvoices(body) {
        const [list, an] = await Promise.all([RData.invoices(), RData.invoiceAnalytics()]);
        const items = list?.items || [];
        body.innerHTML = `
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
              {
                  key: 'tenant',
                  label: 'Khách',
                  render: (it) => esc(it.mainTenant?.name || it.tenant?.name),
              },
              { key: 'room', label: 'Phòng', render: (it) => esc(it.room?.name) },
              { key: 'totalAmount', label: 'Tổng', render: (it) => money(it.totalAmount) },
              { key: 'paidAmount', label: 'Đã thu', render: (it) => money(it.paidAmount) },
              { key: 'period', label: 'Kỳ', render: (it) => esc(it.period || it.month) },
              { key: 'status', label: 'Trạng thái', render: (it) => tagFromStatus(it.status) },
          ],
      })}`;
    }

    async function viewIncomeExpense(body) {
        const [list, an] = await Promise.all([
            RData.incomeExpenses(),
            RData.incomeExpenseAnalytics(),
        ]);
        const items = list?.items || [];
        body.innerHTML = `
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

    async function viewCashflow(body) {
        const cb = await RData.cashbook();
        const items = cb?.items || [];
        body.innerHTML = `
      <div class="kpi-grid">
        ${kpi('Số sổ quỹ', fmt(items.length), '', 'k-primary')}
      </div>
      ${tableView({
          total: items.length,
          items,
          columns: [
              { key: 'name', label: 'Tên sổ' },
              { key: 'balance', label: 'Số dư', render: (it) => money(it.balance) },
              { key: 'type', label: 'Loại', render: (it) => esc(it.type?.name || it.type) },
              {
                  key: 'active',
                  label: 'Trạng thái',
                  render: (it) =>
                      it.active
                          ? '<span class="tag t-success">Hoạt động</span>'
                          : '<span class="tag t-muted">Ngừng</span>',
              },
          ],
      })}`;
    }

    async function viewFees(body) {
        const list = await RData.fees();
        const items = list?.items || [];
        body.innerHTML = tableView({
            total: list?.total,
            items,
            columns: [
                { key: 'code', label: 'Mã' },
                { key: 'name', label: 'Tên khoản thu' },
                { key: 'price', label: 'Đơn giá', render: (it) => money(it.price) },
                { key: 'unit', label: 'ĐVT', render: (it) => esc(it.unit?.name || it.unit) },
                { key: 'type', label: 'Loại', render: (it) => esc(it.type?.name || it.type) },
            ],
        });
    }

    async function viewMeterLogs(body) {
        const [list, an] = await Promise.all([RData.meterLogs(), RData.meterLogAnalytics()]);
        const items = list?.items || [];
        body.innerHTML = `
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
              { key: 'apartment', label: 'Toà', render: (it) => esc(it.apartment?.name) },
              { key: 'room', label: 'Phòng', render: (it) => esc(it.room?.name) },
              {
                  key: 'meterType',
                  label: 'Loại đồng hồ',
                  render: (it) => esc(it.meterType?.name || it.type),
              },
              { key: 'beforeIndex', label: 'Chỉ số trước' },
              { key: 'afterIndex', label: 'Chỉ số sau' },
              { key: 'used', label: 'Tiêu thụ', render: (it) => fmt(it.usedQuantity || it.used) },
              {
                  key: 'logDate',
                  label: 'Ngày',
                  render: (it) => esc((it.logDate || '').substring(0, 10)),
              },
          ],
      })}`;
    }

    /* ============== Tasks / Notifications ============== */
    async function viewTasks(body) {
        const [list, an, gr] = await Promise.all([
            RData.tasksAll(),
            RData.taskAnalytics(),
            RData.taskGroups(),
        ]);
        const items = list?.items || [];
        body.innerHTML = `
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
              { key: 'apartment', label: 'Toà', render: (it) => esc(it.apartment?.name) },
              { key: 'room', label: 'Phòng', render: (it) => esc(it.room?.name) },
              {
                  key: 'performer',
                  label: 'Người làm',
                  render: (it) => esc(it.performer?.name || it.assignee?.name),
              },
              { key: 'priority', label: 'Ưu tiên', render: (it) => tagFromStatus(it.priority) },
              { key: 'status', label: 'Trạng thái', render: (it) => tagFromStatus(it.status) },
          ],
      })}`;
    }

    async function viewMyTasks(body) {
        const [tot, gr] = await Promise.all([RData.myTasks(), RData.taskGroups()]);
        body.innerHTML = `
      <div class="kpi-grid">
        ${kpi('Việc của tôi', fmt(tot?.total ?? 0), '', 'k-primary')}
        ${kpi('Đến hạn', fmt(tot?.dueToday ?? 0), '', 'k-warn')}
        ${kpi('Quá hạn', fmt(tot?.overdue ?? 0), '', 'k-danger')}
      </div>
      <div class="card"><h3 class="section-title">Theo nhóm</h3>
        <pre style="background:var(--surface-2);padding:12px;border-radius:6px;font-size:12px;overflow:auto">${esc(JSON.stringify(gr, null, 2))}</pre>
      </div>`;
    }

    async function viewNotifications(body) {
        const [list, count] = await Promise.all([RData.notifications(), RData.countNotif()]);
        const items = list?.items || [];
        body.innerHTML = `
      <div class="kpi-grid">
        ${kpi('Chưa đọc', fmt(count?.total ?? count?.count ?? 0), '', 'k-warn')}
        ${kpi('Tổng', fmt(list?.total), '', 'k-primary')}
      </div>
      ${tableView({
          total: list?.total,
          items,
          columns: [
              { key: 'title', label: 'Tiêu đề' },
              {
                  key: 'content',
                  label: 'Nội dung',
                  render: (it) => esc((it.content || '').slice(0, 80)),
              },
              { key: 'type', label: 'Loại', render: (it) => esc(it.type?.name || it.type) },
              {
                  key: 'createdAt',
                  label: 'Thời gian',
                  render: (it) =>
                      esc((it.createdAt || it.created_at || '').substring(0, 19).replace('T', ' ')),
              },
          ],
      })}`;
    }

    /* ============== Locations / Assets / Layout / Settings ============== */
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
              { key: 'name', label: 'Tên' },
              { key: 'numberApartments', label: 'Số toà' },
              {
                  key: 'created_at',
                  label: 'Tạo lúc',
                  render: (it) => esc((it.created_at || '').substring(0, 10)),
              },
          ],
      })}`;
    }

    async function viewAssets(body) {
        const [list, an] = await Promise.all([RData.assets(), RData.assetAnalytics()]);
        const items = list?.items || [];
        body.innerHTML = `
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
              { key: 'apartment', label: 'Toà', render: (it) => esc(it.apartment?.name) },
              { key: 'room', label: 'Phòng', render: (it) => esc(it.room?.name) },
              { key: 'quantity', label: 'SL' },
          ],
      })}`;
    }

    async function viewLayout(body) {
        const layout = await RData.apartmentLayout();
        body.innerHTML = `
      <div class="card">
        <h3 class="section-title">Sơ đồ toà <span class="pill">${esc(layout?.apartment?.name || '—')}</span></h3>
        <p style="color:var(--muted);font-size:13px">Demo render dạng raw — UI gốc dùng layout grid theo tầng. Số tầng: <b>${fmt(layout?.floors?.length ?? 0)}</b></p>
        <pre style="background:var(--surface-2);padding:12px;border-radius:6px;font-size:11px;max-height:480px;overflow:auto">${esc(JSON.stringify(layout, null, 2))}</pre>
      </div>`;
    }

    async function viewSettings(body) {
        const [me, perm, conf] = await Promise.all([
            RData.userMe(),
            RData.permission(),
            RData.userConfig(),
        ]);
        body.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h3 class="section-title">Tài khoản</h3>
          <div style="line-height:2;font-size:13px">
            <div>👤 Tên: <b>${esc(me?.name)}</b></div>
            <div>📧 Email: <b>${esc(me?.email)}</b></div>
            <div>📱 Phone: <b>${esc(me?.phone)}</b></div>
            <div>🆔 ID: ${fmt(me?.id)}</div>
            <div>🕒 Đăng nhập gần nhất: ${esc((me?.lastLogin || '').substring(0, 19).replace('T', ' '))}</div>
          </div>
        </div>
        <div class="card">
          <h3 class="section-title">Phân quyền <span class="pill">${fmt(Object.keys(perm || {}).length)} keys</span></h3>
          <pre style="background:var(--surface-2);padding:12px;border-radius:6px;font-size:11px;max-height:300px;overflow:auto">${esc(JSON.stringify(perm, null, 2))}</pre>
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3 class="section-title">User configuration</h3>
        <pre style="background:var(--surface-2);padding:12px;border-radius:6px;font-size:11px;max-height:300px;overflow:auto">${esc(JSON.stringify(conf, null, 2))}</pre>
      </div>`;
    }

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
              .map(
                  (c) =>
                      '<tr><td>' +
                      esc(c.method) +
                      '</td><td><code>' +
                      esc(c.path) +
                      '</code></td><td>' +
                      fmt(c.size) +
                      ' B</td><td><code>' +
                      esc(c.file) +
                      '</code></td></tr>'
              )
              .join('')}</tbody>
        </table>
      </div>`;
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
    };
})();
