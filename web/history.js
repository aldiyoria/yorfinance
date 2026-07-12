const API_BASE = window.location.origin;
const STORAGE_KEY = 'yorfinance_payments';
let pollingInterval = null;

function getPayments() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}

function savePayments(payments) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payments));
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAmount(amount) {
  return 'Rp' + amount.toLocaleString('id-ID');
}

function statusLabel(status) {
  const map = {
    PENDING: 'Menunggu',
    PAID: 'Lunas',
    FAILED: 'Gagal',
    EXPIRED: 'Kadaluarsa',
    REFUNDED: 'Refund',
  };
  return map[status] || status;
}

function render() {
  const payments = getPayments();
  const emptyEl = document.getElementById('historyEmpty');
  const listEl = document.getElementById('historyList');

  if (payments.length === 0) {
    emptyEl.style.display = 'block';
    listEl.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  listEl.style.display = 'flex';

  listEl.innerHTML = payments.map((p) => `
    <div class="history-card" data-external-id="${p.externalId}">
      <div class="history-info">
        <div class="history-email">${p.email}</div>
        <div class="history-meta">
          <span>${formatDate(p.createdAt)}</span>
          <span>ID: ${p.externalId.substring(0, 25)}...</span>
        </div>
        <div class="history-actions">
          ${p.status === 'PENDING' ? `<a href="${API_BASE}/api/payments/status/${p.externalId}" target="_blank" class="btn-sm-link">Cek Status</a>` : ''}
          ${p.status === 'PENDING' ? `<a href="checkout.html" class="btn-sm-link">Bayar Ulang</a>` : ''}
        </div>
      </div>
      <div class="history-right">
        <div class="history-amount">${formatAmount(p.amount)}</div>
        <div class="history-status status-${p.status.toLowerCase()}">${statusLabel(p.status)}</div>
      </div>
    </div>
  `).join('');
}

// Poll backend untuk update status setiap 5 detik (hanya untuk PENDING)
async function pollStatus() {
  const payments = getPayments();
  const pending = payments.filter((p) => p.status === 'PENDING');

  if (pending.length === 0) return;

  for (const p of pending) {
    try {
      const res = await fetch(`${API_BASE}/api/payments/status/${p.externalId}`);
      if (!res.ok) continue;

      const data = await res.json();
      const newStatus = data.payment?.status;

      if (newStatus && newStatus !== p.status) {
        // Update di localStorage
        const all = getPayments();
        const idx = all.findIndex((x) => x.externalId === p.externalId);
        if (idx !== -1) {
          all[idx].status = newStatus;
          if (newStatus === 'PAID') {
            all[idx].paidAt = data.payment.paidAt;
            all[idx].paymentMethod = data.payment.paymentMethod;
          }
          savePayments(all);
          render();
        }
      }
    } catch (err) {
      // Silent fail, akan retry di polling berikutnya
    }
  }
}

// Mulai auto-refresh
function startPolling() {
  render();
  pollingInterval = setInterval(pollStatus, 5000);
}

// Hentikan auto-refresh saat tab tidak aktif (hemat resource)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInterval(pollingInterval);
  } else {
    startPolling();
  }
});

// Init
startPolling();
