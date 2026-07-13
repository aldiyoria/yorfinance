const API_BASE = window.location.origin;

const form = document.getElementById('checkoutForm');
const submitBtn = document.getElementById('submitBtn');
const btnText = submitBtn.querySelector('.btn-text');
const btnLoading = submitBtn.querySelector('.btn-loading');
const formWrapper = document.querySelector('.checkout-form-wrapper');

let packages = [];
let selectedPackage = null;

// Load packages from DB
async function loadPackages() {
  try {
    const res = await fetch(`${API_BASE}/api/packages`);
    if (!res.ok) throw new Error('Gagal load paket');
    const data = await res.json();
    packages = data.packages || [];

    if (packages.length === 0) {
      // Fallback
      packages = [{
        id: null,
        slug: 'basic',
        name: 'Basic',
        description: 'Paket standar untuk pribadi',
        price: 29000,
        durationDays: 30,
        features: [
          'Catat transaksi via chat',
          'Foto struk (AI ekstrak)',
          'Transaksi unlimited',
          'Ringkasan bulanan',
          'Kategori otomatis',
        ],
        isPopular: true,
      }];
    }

    // Default to first package
    selectedPackage = packages[0];
    renderPackageOptions();
    updateSummary();
  } catch (err) {
    console.error('Failed to load packages:', err);
    // Fallback
    packages = [{
      id: null, slug: 'basic', name: 'Basic', price: 29000, durationDays: 30,
      features: [
          'Catat transaksi via chat',
          'Foto struk (AI ekstrak)',
          'Transaksi unlimited',
          'Ringkasan bulanan',
          'Kategori otomatis',
        ],
      isPopular: true,
    }];
    selectedPackage = packages[0];
    renderPackageOptions();
    updateSummary();
  }
}

function renderPackageOptions() {
  const container = document.getElementById('plan-options');
  container.innerHTML = packages.map((pkg, i) => {
    const isFreeTrial = pkg.isFreeTrial;
    const priceLabel = isFreeTrial ? 'Gratis' : `Rp${pkg.price.toLocaleString('id-ID')}<span>/bln</span>`;
    const clickHandler = isFreeTrial ? `window.location.href='trial.html'` : `selectPlan(${i})`;
    const activeClass = !isFreeTrial && i === 0 ? 'plan-active' : '';
    return `
      <div class="plan-card ${activeClass}" data-idx="${i}" onclick="${clickHandler}" style="${isFreeTrial ? 'cursor:pointer' : ''}">
        <div class="plan-info">
          <div class="plan-name">${pkg.name}</div>
          <div class="plan-desc">${pkg.description || ''}</div>
        </div>
        <div class="plan-price">${priceLabel}</div>
      </div>
    `;
  }).join('');
}

function selectPlan(idx) {
  selectedPackage = packages[idx];
  document.querySelectorAll('.plan-card').forEach((el, i) => {
    el.classList.toggle('plan-active', i === idx);
  });
  updateSummary();
}

function updateSummary() {
  if (!selectedPackage) return;
  document.getElementById('summary-plan-name').textContent = `Paket ${selectedPackage.name} (${selectedPackage.durationDays} hari)`;
  document.getElementById('summary-plan-price').textContent = `Rp${selectedPackage.price.toLocaleString('id-ID')}`;
  document.getElementById('summary-total').textContent = `Rp${selectedPackage.price.toLocaleString('id-ID')}`;

  const featureList = document.querySelector('#summary-features ul');
  if (featureList && selectedPackage.features) {
    featureList.innerHTML = selectedPackage.features.map(f => `<li>&#10003; ${f}</li>`).join('');
  }
}

// Submit
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const name = document.getElementById('name').value.trim();

  if (!email) {
    showError('Email wajib diisi.');
    return;
  }

  if (!selectedPackage) {
    showError('Pilih paket terlebih dahulu.');
    return;
  }

  setLoading(true);
  hideError();

  try {
    const body = { email, name };
    if (selectedPackage.id) {
      body.packageId = selectedPackage.id;
    } else {
      body.plan = selectedPackage.slug;
    }

    const res = await fetch(`${API_BASE}/api/payments/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
        amount: selectedPackage.price,
        plan: selectedPackage.name,
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

loadPackages();
