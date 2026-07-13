const API_BASE = window.location.origin;

const form = document.getElementById('trialForm');
const submitBtn = document.getElementById('submitBtn');
const btnText = submitBtn.querySelector('.btn-text');
const btnLoading = submitBtn.querySelector('.btn-loading');
const formWrapper = document.querySelector('.trial-form-wrapper');

// Default fallback
let trialDays = 3;

// Fetch trial config and update page
(async function loadTrialConfig() {
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    if (!res.ok) return;
    const cfg = await res.json();
    if (cfg.trial && cfg.trial.trialDays) {
      trialDays = cfg.trial.trialDays;
      const d = trialDays;
      document.getElementById('trial-title').textContent = `Free Trial ${d} Hari`;
      document.getElementById('trial-subtitle').textContent =
        `Coba YorFinance tanpa kartu kredit selama ${d} hari. Isi email, dapatkan kode aktivasi, langsung mulai catat keuangan.`;
      document.getElementById('trial-duration-badge').textContent = `Berlaku ${d} hari`;
      document.getElementById('trial-duration-info').textContent = `Berlaku ${d} Hari`;
      document.getElementById('trial-duration-note').textContent =
        `Setelah ${d} hari, Anda bisa berlangganan paket Basic untuk melanjutkan.`;
      document.title = `YorFinance — Free Trial ${d} Hari`;
    }
  } catch (_) {}
})();

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
    const res = await fetch(`${API_BASE}/api/trial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Gagal memproses free trial.');
    }

    showSuccess(email);
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

function showSuccess(email) {
  const d = trialDays;

  fetch('/api/config').then(r => r.json()).then(cfg => {
    const botName = '@' + (cfg.botUsername || 'YorFinanceBot');
    formWrapper.innerHTML = `
      <div class="trial-success">
        <div class="success-icon">&#10003;</div>
        <h2>Free Trial Aktif!</h2>
        <p>Kode aktivasi telah dikirim ke <strong>${email}</strong>. Cek inbox (dan folder spam) Anda.</p>

        <div class="trial-steps">
          <h4>Langkah Selanjutnya:</h4>
          <ol>
            <li>Buka Telegram, cari <strong>${botName}</strong></li>
            <li>Kirim <code>/start</code></li>
            <li>Masukkan kode aktivasi dari email</li>
          </ol>
        </div>

        <div class="trial-expiry-alert">
          &#9200; Kode berlaku selama <strong>${d} hari</strong> sejak email dikirim. Setelah itu, Anda bisa berlangganan paket Basic untuk melanjutkan.
        </div>

        <a href="index.html" class="btn btn-ghost" style="margin-top: 8px;">
          Kembali ke Beranda
        </a>
      </div>
    `;
  }).catch(() => {
    formWrapper.innerHTML = `
      <div class="trial-success">
        <div class="success-icon">&#10003;</div>
        <h2>Free Trial Aktif!</h2>
        <p>Kode aktivasi telah dikirim ke <strong>${email}</strong>. Cek inbox (dan folder spam) Anda.</p>
        <div class="trial-steps">
          <h4>Langkah Selanjutnya:</h4>
          <ol>
            <li>Buka Telegram, cari <strong>@YorFinanceBot</strong></li>
            <li>Kirim <code>/start</code></li>
            <li>Masukkan kode aktivasi dari email</li>
          </ol>
        </div>
        <div class="trial-expiry-alert">
          &#9200; Kode berlaku selama <strong>${d} hari</strong> sejak email dikirim.
        </div>
        <a href="index.html" class="btn btn-ghost" style="margin-top: 8px;">Kembali ke Beranda</a>
      </div>
    `;
  });
}
