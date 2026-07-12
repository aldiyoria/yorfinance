(function () {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('t');

  // ===== Telegram Mini App Init =====
  const tg = window.Telegram && window.Telegram.WebApp;

  if (tg) {
    tg.ready();
    tg.expand();
    document.body.classList.add('tg-webapp');

    // Apply Telegram theme params
    const theme = tg.themeParams;
    if (theme) {
      const root = document.documentElement;
      if (theme.bg_color) root.style.setProperty('--tg-bg', theme.bg_color);
      if (theme.text_color) root.style.setProperty('--tg-text', theme.text_color);
      if (theme.hint_color) root.style.setProperty('--tg-hint', theme.hint_color);
      if (theme.link_color) root.style.setProperty('--tg-link', theme.link_color);
      if (theme.button_color) root.style.setProperty('--tg-button', theme.button_color);
      if (theme.button_text_color) root.style.setProperty('--tg-button-text', theme.button_text_color);
      if (theme.secondary_bg_color) root.style.setProperty('--tg-secondary-bg', theme.secondary_bg_color);
      if (theme.header_bg_color) root.style.setProperty('--tg-header-bg', theme.header_bg_color);
      if (theme.accent_text_color) root.style.setProperty('--tg-accent', theme.accent_text_color);
      if (theme.section_bg_color) root.style.setProperty('--tg-section-bg', theme.section_bg_color);
      if (theme.section_header_text_color) root.style.setProperty('--tg-section-header', theme.section_header_text_color);
      if (theme.subtitle_text_color) root.style.setProperty('--tg-subtitle', theme.subtitle_text_color);
      if (theme.destructive_text_color) root.style.setProperty('--tg-destructive', theme.destructive_text_color);
      document.body.classList.add(tg.colorScheme === 'dark' ? 'tg-dark' : 'tg-light');
    }

    // Set header & background colors
    tg.setHeaderColor('#ffffff');
    tg.setBackgroundColor(theme?.bg_color || '#f5f7fa');

    // Back button → close mini app
    tg.BackButton.show();
    tg.BackButton.onClick(function () {
      tg.close();
    });
  }

  if (!token) {
    showError();
    return;
  }

  // State
  let rawData = null;
  let allTransactions = [];
  let periodTransactions = [];
  let filteredTransactions = [];
  let currentPage = 1;
  const PAGE_SIZE = 10;

  let chartMonthly = null;
  let chartCategory = null;
  let chartDaily = null;

  function showError() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error-screen').style.display = 'flex';
  }

  function formatRupiah(n) {
    if (n === undefined || n === null) return 'Rp0';
    return 'Rp' + Number(n).toLocaleString('id-ID');
  }

  function formatShort(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'jt';
    if (n >= 1000) return (n / 1000).toFixed(0) + 'rb';
    return n.toString();
  }

  function formatMonthShort(monthIdx) {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'][monthIdx];
  }

  function haptic(type) {
    if (tg && tg.HapticFeedback) {
      if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
      else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
      else if (type === 'tap') tg.HapticFeedback.impactOccurred('light');
    }
  }

  async function init() {
    try {
      const res = await fetch('/api/dashboard/' + token);
      if (!res.ok) return showError();
      rawData = await res.json();
      haptic('success');
      document.getElementById('loading').style.display = 'none';
      document.getElementById('dashboard').style.display = 'block';
      setupFilter();
      applyFilter();
    } catch {
      showError();
      haptic('error');
    }
  }

  // ===== Filter =====

  function setupFilter() {
    const yearSet = new Set();
    allTransactions = rawData.recentTransactions || [];
    allTransactions.forEach((t) => {
      const y = t.date.substring(0, 4);
      if (y) yearSet.add(y);
    });

    const currentYear = new Date().getFullYear().toString();
    yearSet.add(currentYear);

    const yearSelect = document.getElementById('filter-year');
    yearSelect.innerHTML = '';
    const sortedYears = [...yearSet].sort().reverse();
    sortedYears.forEach((y) => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    });

    const now = new Date();
    document.getElementById('filter-month').value = now.getMonth().toString();
    document.getElementById('filter-year').value = now.getFullYear().toString();

    document.getElementById('filter-month').addEventListener('change', function () {
      haptic('tap');
      applyFilter();
    });
    document.getElementById('filter-year').addEventListener('change', function () {
      haptic('tap');
      applyFilter();
    });
  }

  function applyFilter() {
    const monthVal = document.getElementById('filter-month').value;
    const yearVal = document.getElementById('filter-year').value;

    const filterMonth = monthVal === 'all' ? null : parseInt(monthVal, 10);
    const filterYear = parseInt(yearVal, 10);

    periodTransactions = allTransactions.filter((t) => {
      const parts = t.date.split('-');
      if (parts.length < 3) return true;
      const txYear = parseInt(parts[0], 10);
      const txMonth = parseInt(parts[1], 10) - 1;
      if (txYear !== filterYear) return false;
      if (filterMonth !== null && txMonth !== filterMonth) return false;
      return true;
    });

    filteredTransactions = [...periodTransactions];
    currentPage = 1;

    renderFilteredSummary(filterMonth, filterYear);
    renderFilteredCharts(filterMonth, filterYear);
    renderBudgets(rawData.budgets);
    renderTxTable();
    setupSearch();
  }

  // ===== Summary Cards =====

  function renderFilteredSummary(filterMonth, filterYear) {
    let income = 0;
    let expense = 0;
    let count = 0;

    filteredTransactions.forEach((t) => {
      income += t.type === 'income' ? t.amount : 0;
      expense += t.type === 'expense' ? t.amount : 0;
      count++;
    });

    const balance = income - expense;
    const monthLabel = filterMonth !== null
      ? formatMonthShort(filterMonth) + ' ' + filterYear
      : 'Semua ' + filterYear;

    document.getElementById('user-name').textContent = rawData.user.name || rawData.user.email;
    const genAt = new Date(rawData.generatedAt);
    document.getElementById('generated-at').textContent =
      'Updated: ' + genAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    document.getElementById('total-balance').textContent = formatRupiah(balance);
    document.getElementById('total-tx-count').textContent = count + ' transaksi';
    document.getElementById('total-income').textContent = formatRupiah(income);
    document.getElementById('total-expense').textContent = formatRupiah(expense);

    document.getElementById('month-income').textContent = monthLabel + ': ' + formatRupiah(income);
    document.getElementById('month-expense').textContent = monthLabel + ': ' + formatRupiah(expense);

    const monthBalEl = document.getElementById('month-balance');
    monthBalEl.textContent = formatRupiah(balance);
    monthBalEl.className = 'card-value ' + (balance >= 0 ? 'green' : 'red');

    document.querySelector('.card-month .card-label').textContent = 'Saldo ' + monthLabel;
    document.getElementById('month-tx-count').textContent = count + ' transaksi periode ini';
  }

  // ===== Charts =====

  function renderFilteredCharts(filterMonth, filterYear) {
    const byMonth = {};
    const byCategory = {};
    const byDay = {};

    for (let m = 0; m < 12; m++) {
      const key = filterYear + '-' + String(m + 1).padStart(2, '0');
      byMonth[key] = { income: 0, expense: 0 };
    }

    filteredTransactions.forEach((t) => {
      const parts = t.date.split('-');
      if (parts.length < 2) return;
      const txYear = parseInt(parts[0], 10);
      const txMonth = parseInt(parts[1], 10);

      const monthKey = txYear + '-' + String(txMonth).padStart(2, '0');
      if (byMonth[monthKey]) {
        byMonth[monthKey][t.type] += t.amount;
      }

      if (t.type === 'expense') {
        byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
      }

      const dayKey = t.date.substring(0, 10);
      if (!byDay[dayKey]) byDay[dayKey] = { income: 0, expense: 0 };
      byDay[dayKey][t.type] += t.amount;
    });

    renderMonthlyChart(byMonth, filterYear);
    renderCategoryChart(byCategory);

    if (filterMonth !== null) {
      renderDailyChart(byDay, 'Harian ' + formatMonthShort(filterMonth) + ' ' + filterYear);
    } else {
      const days = Object.keys(byDay).sort().slice(-30);
      const last30 = {};
      days.forEach((d) => { last30[d] = byDay[d]; });
      renderDailyChart(last30, 'Harian 30 Hari Terakhir');
    }
  }

  function renderMonthlyChart(byMonth, year) {
    const months = Object.keys(byMonth).sort();
    const incomeData = months.map((m) => byMonth[m].income);
    const expenseData = months.map((m) => byMonth[m].expense);
    const labels = months.map((m) => {
      const mo = parseInt(m.split('-')[1], 10) - 1;
      return formatMonthShort(mo);
    });

    if (chartMonthly) chartMonthly.destroy();

    chartMonthly = new Chart(document.getElementById('chart-monthly'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Pemasukan', data: incomeData, backgroundColor: '#10b981', borderRadius: 6, barPercentage: 0.7 },
          { label: 'Pengeluaran', data: expenseData, backgroundColor: '#ef4444', borderRadius: 6, barPercentage: 0.7 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } },
          tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': ' + formatRupiah(ctx.parsed.y) } },
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => formatShort(v) }, grid: { color: '#f3f4f6' } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  function renderCategoryChart(byCategory) {
    const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

    if (chartCategory) chartCategory.destroy();

    if (entries.length === 0) {
      document.getElementById('chart-category').parentElement.innerHTML =
        '<h3>Distribusi Pengeluaran</h3><p style="color:#9ca3af;text-align:center;padding:40px 0">Belum ada data pengeluaran</p>';
      return;
    }

    const labels = entries.map(([cat]) => cat);
    const values = entries.map(([, amt]) => amt);
    const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1'];

    chartCategory = new Chart(document.getElementById('chart-category'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors.slice(0, entries.length), borderWidth: 0 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = Math.round((ctx.parsed / total) * 100);
                return ctx.label + ': ' + formatRupiah(ctx.parsed) + ' (' + pct + '%)';
              },
            },
          },
        },
      },
    });
  }

  function renderDailyChart(byDay, title) {
    const days = Object.keys(byDay).sort();
    const expenseData = days.map((d) => byDay[d].expense);
    const labels = days.map((d) => {
      const dt = new Date(d);
      return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    });

    const titleEl = document.getElementById('chart-daily')?.closest('.chart-card')?.querySelector('h3');
    if (titleEl) titleEl.textContent = title || 'Tren Pengeluaran Harian';

    if (chartDaily) chartDaily.destroy();

    if (days.length === 0) {
      const parent = document.getElementById('chart-daily')?.closest('.chart-card');
      if (parent) parent.innerHTML = '<h3>' + (title || 'Tren Pengeluaran Harian') + '</h3><p style="color:#9ca3af;text-align:center;padding:40px 0">Belum ada data</p>';
      return;
    }

    chartDaily = new Chart(document.getElementById('chart-daily'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Pengeluaran',
          data: expenseData,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239,68,68,0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: '#ef4444',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => formatRupiah(ctx.parsed.y) } },
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => formatShort(v) }, grid: { color: '#f3f4f6' } },
          x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 11 } } },
        },
      },
    });
  }

  function renderBudgets(budgets) {
    const el = document.getElementById('budget-list');
    if (!el) return;
    if (!budgets || budgets.length === 0) {
      el.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:24px 0;font-size:13px">Belum ada budget bulan ini.<br>Ketik <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px">set budget makanan 800rb</code> di bot.</p>';
      return;
    }

    el.innerHTML = budgets.map((b) => {
      const pct = b.budget > 0 ? Math.min(Math.round((b.spent / b.budget) * 100), 100) : 0;
      const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'safe';
      return `
        <div class="budget-item">
          <div class="budget-header">
            <span class="name">${b.category}</span>
            <span class="amounts">${formatRupiah(b.spent)} / ${formatRupiah(b.budget)}</span>
          </div>
          <div class="budget-bar">
            <div class="budget-fill ${cls}" style="width:${pct}%"></div>
          </div>
        </div>`;
    }).join('');
  }

  // ===== Transaction Table =====

  function setupSearch() {
    const input = document.getElementById('tx-search');
    if (!input) return;
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    newInput.addEventListener('input', function () {
      const q = this.value.toLowerCase().trim();
      if (!q) {
        filteredTransactions = [...periodTransactions];
      } else {
        filteredTransactions = periodTransactions.filter((t) => {
          return (
            t.date.toLowerCase().includes(q) ||
            t.item.toLowerCase().includes(q) ||
            t.category.toLowerCase().includes(q) ||
            (t.type === 'income' ? 'pemasukan' : 'pengeluaran').includes(q) ||
            formatRupiah(t.amount).toLowerCase().includes(q)
          );
        });
      }
      currentPage = 1;
      renderTxTable();
    });
  }

  function renderTxTable() {
    const tbody = document.getElementById('tx-body');
    const emptyEl = document.getElementById('tx-empty');
    const tableEl = tbody.closest('table');
    const total = filteredTransactions.length;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    if (currentPage > totalPages) currentPage = totalPages || 1;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredTransactions.slice(startIdx, startIdx + PAGE_SIZE);

    if (total === 0) {
      tableEl.style.display = 'none';
      emptyEl.style.display = 'block';
    } else {
      tableEl.style.display = '';
      emptyEl.style.display = 'none';
    }

    tbody.innerHTML = pageItems.map((t) => {
      const isIncome = t.type === 'income';
      return `
        <tr>
          <td>${t.date}</td>
          <td><span class="tx-type-badge ${isIncome ? 'income' : 'expense'}">${isIncome ? 'Pemasukan' : 'Pengeluaran'}</span></td>
          <td>${t.category}</td>
          <td>${t.item}</td>
          <td><span class="tx-amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '-'}${formatRupiah(t.amount)}</span></td>
        </tr>`;
    }).join('');

    renderPagination(totalPages, total, startIdx, pageItems.length);
  }

  function renderPagination(totalPages, total, startIdx, pageCount) {
    const container = document.getElementById('tx-pagination');
    const infoEl = document.getElementById('tx-info');

    if (total === 0) {
      container.innerHTML = '';
      infoEl.textContent = '';
      return;
    }

    const from = startIdx + 1;
    const to = startIdx + pageCount;
    infoEl.textContent = `Menampilkan ${from}-${to} dari ${total} transaksi`;

    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = '';
    html += `<button class="page-btn" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>&laquo;</button>`;

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    for (let i = startPage; i <= endPage; i++) {
      html += `<button class="page-btn${i === currentPage ? ' active' : ''}" data-page="${i}">${i}</button>`;
    }

    html += `<button class="page-btn" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>&raquo;</button>`;

    container.innerHTML = html;

    container.querySelectorAll('.page-btn').forEach((btn) => {
      btn.addEventListener('click', function () {
        haptic('tap');
        const page = parseInt(this.dataset.page, 10);
        if (page >= 1 && page <= totalPages) {
          currentPage = page;
          renderTxTable();
        }
      });
    });
  }

  init();
})();
