(function () {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('t');

  // Telegram WebApp detection
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    document.body.classList.add('tg-webapp');
  }

  if (!token) {
    showError();
    return;
  }

  // State
  let allTransactions = [];
  let filteredTransactions = [];
  let currentPage = 1;
  const PAGE_SIZE = 10;

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

  async function init() {
    try {
      const res = await fetch('/api/dashboard/' + token);
      if (!res.ok) return showError();
      const data = await res.json();
      renderDashboard(data);
    } catch {
      showError();
    }
  }

  function renderDashboard(data) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';

    // User info
    document.getElementById('user-name').textContent = data.user.name || data.user.email;
    const genAt = new Date(data.generatedAt);
    document.getElementById('generated-at').textContent =
      'Updated: ' + genAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Summary cards
    const s = data.summary;
    document.getElementById('total-balance').textContent = formatRupiah(s.totalBalance);
    document.getElementById('total-tx-count').textContent = s.txCount + ' total transaksi';
    document.getElementById('total-income').textContent = formatRupiah(s.totalIncome);
    document.getElementById('month-income').textContent = 'Bulan ini: ' + formatRupiah(s.monthIncome);
    document.getElementById('total-expense').textContent = formatRupiah(s.totalExpense);
    document.getElementById('month-expense').textContent = 'Bulan ini: ' + formatRupiah(s.monthExpense);
    document.getElementById('month-balance').textContent = formatRupiah(s.monthBalance);
    document.getElementById('month-tx-count').textContent = s.monthTxCount + ' transaksi bulan ini';

    const monthBalEl = document.getElementById('month-balance');
    monthBalEl.className = 'card-value ' + (s.monthBalance >= 0 ? 'green' : 'red');

    renderMonthlyChart(data.byMonth);
    renderCategoryChart(data.byCategory);
    renderDailyChart(data.byDay);
    renderBudgets(data.budgets);

    // Store transactions and set up search + pagination
    allTransactions = data.recentTransactions || [];
    filteredTransactions = [...allTransactions];
    currentPage = 1;
    renderTxTable();
    setupSearch();
  }

  function renderMonthlyChart(byMonth) {
    const months = Object.keys(byMonth).sort();
    const incomeData = months.map((m) => byMonth[m].income);
    const expenseData = months.map((m) => byMonth[m].expense);
    const labels = months.map((m) => {
      const [y, mo] = m.split('-');
      const d = new Date(y, mo - 1);
      return d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
    });

    new Chart(document.getElementById('chart-monthly'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Pemasukan',
            data: incomeData,
            backgroundColor: '#10b981',
            borderRadius: 6,
            barPercentage: 0.7,
          },
          {
            label: 'Pengeluaran',
            data: expenseData,
            backgroundColor: '#ef4444',
            borderRadius: 6,
            barPercentage: 0.7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.label + ': ' + formatRupiah(ctx.parsed.y),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => formatShort(v) },
            grid: { color: '#f3f4f6' },
          },
          x: { grid: { display: false } },
        },
      },
    });
  }

  function renderCategoryChart(byCategory) {
    const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
      document.getElementById('chart-category').parentElement.innerHTML =
        '<h3>Distribusi Pengeluaran</h3><p style="color:#9ca3af;text-align:center;padding:40px 0">Belum ada data pengeluaran</p>';
      return;
    }

    const labels = entries.map(([cat]) => cat);
    const values = entries.map(([, amt]) => amt);
    const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1'];

    new Chart(document.getElementById('chart-category'), {
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

  function renderDailyChart(byDay) {
    const days = Object.keys(byDay).sort();
    const last30 = days.slice(-30);
    const expenseData = last30.map((d) => byDay[d].expense);
    const labels = last30.map((d) => {
      const dt = new Date(d);
      return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    });

    if (last30.length === 0) {
      document.getElementById('chart-daily').parentElement.innerHTML =
        '<h3>Tren Pengeluaran Harian (30 Hari)</h3><p style="color:#9ca3af;text-align:center;padding:40px 0">Belum ada data</p>';
      return;
    }

    new Chart(document.getElementById('chart-daily'), {
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

  // ===== Transaction Table with Search + Pagination =====

  function setupSearch() {
    const input = document.getElementById('tx-search');
    if (!input) return;
    input.addEventListener('input', function () {
      const q = this.value.toLowerCase().trim();
      if (!q) {
        filteredTransactions = [...allTransactions];
      } else {
        filteredTransactions = allTransactions.filter((t) => {
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

    // Show max 5 page buttons
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
