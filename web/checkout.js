const API_BASE = window.location.origin;

const form = document.getElementById('checkoutForm');
const submitBtn = document.getElementById('submitBtn');
const btnText = submitBtn.querySelector('.btn-text');
const btnLoading = submitBtn.querySelector('.btn-loading');
const formWrapper = document.querySelector('.checkout-form-wrapper');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const name = document.getElementById('name').value.trim();

  if (!email) {
    showError('Email wajib diisi.');
    return;
  }

  setLoading(true);
  hideError();

  try {
    const res = await fetch(`${API_BASE}/api/payments/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, plan: 'basic' }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || data.detail || 'Gagal membuat invoice.');
    }

    if (data.paymentUrl) {
      const payments = JSON.parse(localStorage.getItem('yorfinance_payments') || '[]');
      payments.push({
        externalId: data.externalId,
        sessionId: data.sessionId,
        email: email,
        name: name,
        amount: 29000,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem('yorfinance_payments', JSON.stringify(payments));

      showSuccess(data.paymentUrl, email);
    } else {
      throw new Error('Payment URL tidak ditemukan.');
    }
  } catch (err) {
    showError(err.message);
    setLoading(false);
  }
});

function setLoading(loading) {
  submitBtn.disabled = loading;
  btnText.style.display = loading ? 'none' : 'inline';
  btnLoading.style.display = loading ? 'inline-flex' : 'none';
}

function showError(message) {
  let errorEl = document.querySelector('.form-error');
  if (!errorEl) {
    errorEl = document.createElement('div');
    errorEl.className = 'form-error';
    form.insertBefore(errorEl, form.firstChild);
  }
  errorEl.textContent = message;
  errorEl.classList.add('active');
}

function hideError() {
  const errorEl = document.querySelector('.form-error');
  if (errorEl) errorEl.classList.remove('active');
}

function showSuccess(paymentUrl, email) {
  formWrapper.innerHTML = `
    <div class="checkout-success">
      <div class="success-icon">&#10003;</div>
      <h2>Checkout Berhasil!</h2>
      <p>Pembayaran telah dikirim ke <strong>${email}</strong>. Klik tombol di bawah untuk melakukan pembayaran.</p>
      <a href="${paymentUrl}" target="_blank" class="btn btn-primary btn-lg invoice-link">
        Bayar Sekarang &#8594;
      </a>
      <p style="font-size: 13px; color: #6B7280; margin-top: 16px;">
        Setelah pembayaran berhasil, Anda akan menerima email berisi <strong>redeem code</strong> untuk mengaktifkan bot.
      </p>
      <a href="history.html" style="font-size: 13px; color: var(--primary); margin-top: 12px; display: inline-block;">
        Lihat Status Pembayaran &#8594;
      </a>
    </div>
  `;
}
