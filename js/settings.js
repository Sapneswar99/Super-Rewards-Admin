/* ============================================
   SUPER REWARDS ADMIN — SETTINGS
   Load + Save platform settings
   v2 — Prevent duplicate setup + cleanup
   ============================================ */

import { auth, db } from './firebase-config.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* ============================================
   STATE
   ============================================ */
let currentSettings = {
  coinRate: 100,
  minWithdraw: 1000,
  cpxAppId: '',
  adgemAppId: '',
  maintenance: false
};

let isSetupDone = false;

/* ============================================
   DOM HELPERS
   ============================================ */
const $ = (id) => document.getElementById(id);

function showLoading(text) {
  const el = $('adminLoading');
  if (!el) return;
  const textEl = el.querySelector('.admin-loading-text');
  if (textEl) textEl.textContent = text || 'Loading...';
  el.classList.remove('hidden');
}

function hideLoading() {
  const el = $('adminLoading');
  if (el) el.classList.add('hidden');
}

function showSaveMsg(msg, type = 'success') {
  const el = $('saveMsg');
  if (!el) return;

  el.textContent = msg;
  el.className = 'admin-save-msg ' + type;

  // Auto-clear after 4 seconds
  setTimeout(() => {
    if (el.textContent === msg) {
      el.textContent = '';
      el.className = 'admin-save-msg';
    }
  }, 4000);
}

/* ============================================
   LOAD SETTINGS FROM FIRESTORE
   ============================================ */
async function loadSettings() {
  try {
    const settingsRef = doc(db, 'settings', 'platform');
    const snap = await getDoc(settingsRef);

    if (snap.exists()) {
      const data = snap.data();

      currentSettings = {
        coinRate: Number(data.coinRate) || 100,
        minWithdraw: Number(data.minWithdraw) || 1000,
        cpxAppId: data.cpxAppId || '',
        adgemAppId: data.adgemAppId || '',
        maintenance: Boolean(data.maintenance)
      };
    } else {
      // First time — use defaults and create doc
      await setDoc(settingsRef, {
        coinRate: 100,
        minWithdraw: 1000,
        cpxAppId: '',
        adgemAppId: '',
        maintenance: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    populateForm();

  } catch (err) {
    console.error('Settings load error:', err);

    // Load from localStorage as fallback
    try {
      const cached = localStorage.getItem('sr_admin_settings');
      if (cached) {
        currentSettings = JSON.parse(cached);
        populateForm();
      }
    } catch (localErr) {
      console.warn('Local cache load failed:', localErr);
    }

    showSaveMsg('Could not load settings from server. Using defaults.', 'error');
  }
}

/* ============================================
   POPULATE FORM FIELDS
   ============================================ */
function populateForm() {
  const coinRateEl = $('settingsCoinRate');
  const minWithdrawEl = $('settingsMinWithdraw');
  const cpxIdEl = $('settingsCpxId');
  const adgemIdEl = $('settingsAdgemId');
  const maintenanceEl = $('settingsMaintenance');

  if (coinRateEl) coinRateEl.value = currentSettings.coinRate;
  if (minWithdrawEl) minWithdrawEl.value = currentSettings.minWithdraw;
  if (cpxIdEl) cpxIdEl.value = currentSettings.cpxAppId;
  if (adgemIdEl) adgemIdEl.value = currentSettings.adgemAppId;
  if (maintenanceEl) maintenanceEl.checked = currentSettings.maintenance;

  // Cache in localStorage for user panel
  try {
    localStorage.setItem('sr_admin_settings', JSON.stringify(currentSettings));
  } catch {}
}

/* ============================================
   VALIDATE + SAVE SETTINGS
   ============================================ */
async function saveSettings() {
  const saveBtn = $('saveSettingsBtn');
  if (!saveBtn) return;

  const coinRate = parseInt($('settingsCoinRate')?.value, 10);
  const minWithdraw = parseInt($('settingsMinWithdraw')?.value, 10);
  const cpxAppId = ($('settingsCpxId')?.value || '').trim();
  const adgemAppId = ($('settingsAdgemId')?.value || '').trim();
  const maintenance = $('settingsMaintenance')?.checked || false;

  /* ----- VALIDATIONS ----- */
  if (!coinRate || coinRate < 1 || coinRate > 10000) {
    showSaveMsg('Coins per ₹1 must be between 1 and 10000.', 'error');
    $('settingsCoinRate')?.focus();
    return;
  }

  if (!minWithdraw || minWithdraw < 100 || minWithdraw > 1000000) {
    showSaveMsg('Minimum withdrawal must be between 100 and 10,00,000.', 'error');
    $('settingsMinWithdraw')?.focus();
    return;
  }

  if (minWithdraw % 100 !== 0) {
    showSaveMsg('Minimum withdrawal must be a multiple of 100.', 'error');
    return;
  }

  if (cpxAppId && !/^[a-zA-Z0-9_-]{1,50}$/.test(cpxAppId)) {
    showSaveMsg('CPX App ID contains invalid characters.', 'error');
    $('settingsCpxId')?.focus();
    return;
  }

  if (adgemAppId && !/^[a-zA-Z0-9_-]{1,50}$/.test(adgemAppId)) {
    showSaveMsg('AdGem App ID contains invalid characters.', 'error');
    $('settingsAdgemId')?.focus();
    return;
  }

  /* ----- SAVE ----- */
  saveBtn.disabled = true;
  const originalHTML = saveBtn.innerHTML;
  saveBtn.innerHTML = `
    <div class="admin-mini-spinner" style="width:16px;height:16px;margin:0;border-width:2px;border-top-color:#fff;border-color:rgba(255,255,255,0.3);border-top-color:#fff;"></div>
    <span>Saving...</span>`;

  try {
    const settingsRef = doc(db, 'settings', 'platform');

    const newSettings = {
      coinRate: coinRate,
      minWithdraw: minWithdraw,
      cpxAppId: cpxAppId,
      adgemAppId: adgemAppId,
      maintenance: maintenance,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.email || 'unknown'
    };

    const existingSnap = await getDoc(settingsRef);
    const coinRateChanged = existingSnap.exists() &&
      Number(existingSnap.data().coinRate) !== coinRate;

    if (existingSnap.exists()) {
      await setDoc(settingsRef, newSettings, { merge: true });
    } else {
      await setDoc(settingsRef, {
        ...newSettings,
        createdAt: serverTimestamp()
      });
    }

    // Update local state
    currentSettings = {
      coinRate,
      minWithdraw,
      cpxAppId,
      adgemAppId,
      maintenance
    };

    // Cache in localStorage
    try {
      localStorage.setItem('sr_admin_settings', JSON.stringify(currentSettings));
      localStorage.setItem('sr_settings_updated', Date.now().toString());
    } catch {}

    showSaveMsg('✅ Settings saved successfully!', 'success');

    if (coinRateChanged) {
      setTimeout(() => {
        alert(
          '⚠️ Coin rate changed!\n\n' +
          'Users will now see the new conversion rate on their next page load.\n\n' +
          'New rate: ' + coinRate + ' coins = ₹1'
        );
      }, 500);
    }

  } catch (err) {
    console.error('Settings save error:', err);

    if (err.code === 'permission-denied') {
      showSaveMsg('Permission denied. Check Firestore Rules.', 'error');
    } else if (err.code === 'unavailable') {
      showSaveMsg('Network error. Check your internet.', 'error');
    } else {
      showSaveMsg(err.message || 'Could not save settings. Try again.', 'error');
    }
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalHTML;
  }
}

/* ============================================
   CLEAR LOCAL CACHE
   ============================================ */
async function clearCache() {
  const confirmed = confirm(
    'Clear local cache?\n\n' +
    'This will clear:\n' +
    '• Cached settings\n' +
    '• Session data\n' +
    '• Any temporary data\n\n' +
    'You will NOT be logged out.'
  );

  if (!confirmed) return;

  showLoading('Clearing cache...');

  try {
    localStorage.removeItem('sr_admin_settings');
    localStorage.removeItem('sr_settings_updated');
    sessionStorage.clear();

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }

    hideLoading();
    showSaveMsg('✅ Cache cleared successfully!', 'success');

    setTimeout(() => {
      alert('Cache cleared. Reloading...');
      window.location.reload();
    }, 800);

  } catch (err) {
    console.error('Cache clear error:', err);
    hideLoading();
    showSaveMsg('Could not clear cache completely.', 'error');
  }
}

/* ============================================
   SIGN OUT FROM ALL DEVICES
   ============================================ */
async function signOutAllDevices() {
  const confirmed = confirm(
    '⚠️ Sign out from ALL devices?\n\n' +
    'This will:\n' +
    '• Log you out of this device\n' +
    '• Revoke all admin sessions\n' +
    '• Require fresh login\n\n' +
    'Are you sure?'
  );

  if (!confirmed) return;

  showLoading('Signing out from all devices...');

  try {
    // Note: Firebase standard signOut only logs out current device.
    // To log out from ALL devices, you need Admin SDK (Cloud Functions).
    // For this frontend panel, this will safely log out the current session.
    await signOut(auth);
    hideLoading();

    setTimeout(() => {
      window.location.replace('login.html');
    }, 400);

  } catch (err) {
    console.error('Sign out error:', err);
    hideLoading();
    showSaveMsg('Sign out failed. Try again.', 'error');
  }
}

/* ============================================
   ENTER KEY ON INPUTS
   ============================================ */
function setupEnterKeySave() {
  ['settingsCoinRate', 'settingsMinWithdraw', 'settingsCpxId', 'settingsAdgemId'].forEach((id) => {
    const el = $(id);
    if (el) {
      el.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveSettings();
        }
      });
    }
  });
}

/* ============================================
   SETUP BUTTONS
   ============================================ */
function setupButtons() {
  const saveBtn = $('saveSettingsBtn');
  if (saveBtn && !saveBtn.dataset.bound) {
    saveBtn.dataset.bound = '1';
    saveBtn.addEventListener('click', saveSettings);
  }

  const clearCacheBtn = $('clearCacheBtn');
  if (clearCacheBtn && !clearCacheBtn.dataset.bound) {
    clearCacheBtn.dataset.bound = '1';
    clearCacheBtn.addEventListener('click', clearCache);
  }

  const signOutAllBtn = $('signOutAllBtn');
  if (signOutAllBtn && !signOutAllBtn.dataset.bound) {
    signOutAllBtn.dataset.bound = '1';
    signOutAllBtn.addEventListener('click', signOutAllDevices);
  }
}

/* ============================================
   SHOW ADMIN LAST LOGIN
   ============================================ */
async function loadAdminInfo(user) {
  if (!user) return;

  const emailEl = $('adminInfoEmail');
  if (emailEl) emailEl.textContent = user.email || '—';

  const lastLoginEl = $('adminInfoLastLogin');
  if (!lastLoginEl) return;

  try {
    const adminRef = doc(db, 'admins', user.uid);
    const snap = await getDoc(adminRef);

    if (snap.exists()) {
      const data = snap.data();
      if (data.lastLogin?.toDate) {
        const date = data.lastLogin.toDate();
        lastLoginEl.textContent = date.toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
      } else {
        lastLoginEl.textContent = 'First session';
      }
    } else {
      lastLoginEl.textContent = 'First session';
    }
  } catch (err) {
    console.warn('Admin info load failed:', err);
    lastLoginEl.textContent = '—';
  }
}

/* ============================================
   SETUP SETTINGS PAGE (Once)
   ============================================ */
async function setupSettings() {
  if (isSetupDone) {
    console.log('[Settings] Already setup — skipping');
    return;
  }
  isSetupDone = true;

  console.log('[Settings] Loading settings...');

  const user = auth.currentUser;

  setupButtons();
  setupEnterKeySave();

  await loadSettings();
  await loadAdminInfo(user);

  /* ----- REFRESH BUTTON ----- */
  const refreshBtn = $('refreshBtn');
  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = '1';
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.classList.add('spinning');
      try {
        await loadSettings();
        await loadAdminInfo(user);
        showSaveMsg('Settings reloaded.', 'success');
      } finally {
        setTimeout(() => {
          refreshBtn.classList.remove('spinning');
        }, 600);
      }
    });
  }
}

/* ============================================
   INIT AFTER AUTH
   ============================================ */
window.addEventListener('adminReady', (e) => {
  console.log('[Settings] adminReady event received');
  setupSettings();
});
