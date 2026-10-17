/* ============================================
   SUPER REWARDS ADMIN — DASHBOARD
   Stats + Recent Data + Pending Badge
   v3 — Fixed collection names & status cases
   ============================================ */

import { auth, db } from './firebase-config.js';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ============================================
   DOM HELPERS
   ============================================ */
const $ = (id) => document.getElementById(id);
const setText = (id, value) => {
  const el = $(id);
  if (el) el.textContent = value;
};

/* ============================================
   FORMAT HELPERS
   ============================================ */
function formatDate(timestamp) {
  if (!timestamp) return '—';
  try {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return '—';
  }
}

function formatNumber(num) {
  return (Number(num) || 0).toLocaleString('en-IN');
}

function getInitial(name) {
  return (name || 'U').trim().charAt(0).toUpperCase() || 'U';
}

// App UPPERCASE me method bhejta hai (UPI, GOOGLE_PLAY, AMAZON_PAY)
function getMethodLabel(method) {
  const m = String(method).toUpperCase();
  if (m === 'GOOGLE_PLAY') return 'Google Play';
  if (m === 'AMAZON_PAY') return 'Amazon Pay';
  return 'UPI';
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ============================================
   STATE
   ============================================ */
let isSetupDone = false;
let autoRefreshTimer = null;

/* ============================================
   LOAD STATS
   ============================================ */
async function loadStats() {
  try {
    /* ----- 1. TOTAL USERS ----- */
    const usersColl = collection(db, 'users');
    const usersCountSnap = await getCountFromServer(usersColl);
    setText('statTotalUsers', formatNumber(usersCountSnap.data().count));

    /* ----- 2. PENDING REDEMPTIONS ----- */
    // FIX: 'withdrawals' -> 'redemptions', 'pending' -> 'PENDING'
    const pendingWQ = query(
      collection(db, 'redemptions'),
      where('status', '==', 'PENDING')
    );
    const pendingCountSnap = await getCountFromServer(pendingWQ);
    const pendingCount = pendingCountSnap.data().count;
    setText('statPendingWithdrawals', formatNumber(pendingCount));

    // Update bottom nav badge
    const navBadge = $('navPendingBadge');
    if (navBadge) {
      if (pendingCount > 0) {
        navBadge.textContent = pendingCount > 99 ? '99+' : pendingCount;
        navBadge.classList.remove('hidden');
      } else {
        navBadge.classList.add('hidden');
      }
    }

    /* ----- 3. TOTAL PAID ----- */
    // FIX: 'withdrawals' -> 'redemptions', 'approved' -> 'PAID'
    const approvedWQ = query(
      collection(db, 'redemptions'),
      where('status', '==', 'PAID')
    );
    const approvedSnap = await getDocs(approvedWQ);

    let totalPaid = 0;
    approvedSnap.forEach((docSnap) => {
      const data = docSnap.data();
      totalPaid += Number(data.amountINR) || 0;
    });
    setText('statTotalPaid', formatNumber(Math.floor(totalPaid)));

    /* ----- 4. COINS IN CIRCULATION ----- */
    const allUsersSnap = await getDocs(usersColl);
    let totalCoins = 0;
    allUsersSnap.forEach((docSnap) => {
      const data = docSnap.data();
      totalCoins += Number(data.coins) || 0;
    });
    setText('statTotalCoins', formatNumber(totalCoins));

  } catch (err) {
    console.error('Stats load error:', err);
    setText('statTotalUsers', '—');
    setText('statPendingWithdrawals', '—');
    setText('statTotalPaid', '—');
    setText('statTotalCoins', '—');
  }
}

/* ============================================
   LOAD RECENT PENDING REDEMPTIONS
   ============================================ */
async function loadRecentWithdrawals() {
  const tbody = $('recentWithdrawals');
  if (!tbody) return;

  try {
    // FIX: 'withdrawals' -> 'redemptions', 'pending' -> 'PENDING'
    const q = query(
      collection(db, 'redemptions'),
      where('status', '==', 'PENDING'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const snap = await getDocs(q);
    tbody.innerHTML = '';

    if (snap.empty) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;color:#8b95a8;padding:32px;">
            No pending redemptions 🎉
          </td>
        </tr>`;
      return;
    }

    snap.forEach((docSnap) => {
      const w = docSnap.data();
      const date = formatDate(w.createdAt);
      const status = (w.status || 'PENDING').toUpperCase();
      const methodLabel = getMethodLabel(w.method);
      
      // Kyunki redemption doc me shayad naam na ho, UID dikhayenge fallback ke liye
      const displayName = w.userName || w.userId || 'User';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${date}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0;">
              ${escapeHtml(getInitial(displayName))}
            </div>
            <span>${escapeHtml(displayName)}</span>
          </div>
        </td>
        <td>${methodLabel}</td>
        <td><strong style="color:#a78bfa;">₹${w.amountINR || 0}</strong></td>
        <td><span class="admin-wd-status ${status.toLowerCase()}">${status}</span></td>
      `;
      tbody.appendChild(row);
    });

  } catch (err) {
    console.error('Recent redemptions load error:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;color:#8b95a8;padding:32px;">
          Could not load redemptions
        </td>
      </tr>`;
  }
}

/* ============================================
   LOAD RECENT USERS
   ============================================ */
async function loadRecentUsers() {
  const tbody = $('recentUsers');
  if (!tbody) return;

  try {
    const q = query(
      collection(db, 'users'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const snap = await getDocs(q);
    tbody.innerHTML = '';

    if (snap.empty) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center;color:#8b95a8;padding:32px;">
            No users yet
          </td>
        </tr>`;
      return;
    }

    snap.forEach((docSnap) => {
      const u = docSnap.data();
      const date = formatDate(u.createdAt);
      const coins = formatNumber(u.coins);

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0;">
              ${escapeHtml(getInitial(u.name))}
            </div>
            <span>${escapeHtml(u.name || 'User')}</span>
          </div>
        </td>
        <td>${escapeHtml(u.email || '—')}</td>
        <td><strong style="color:#a78bfa;">${coins}</strong></td>
        <td>${date}</td>
      `;
      tbody.appendChild(row);
    });

  } catch (err) {
    console.error('Recent users load error:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center;color:#8b95a8;padding:32px;">
          Could not load users
        </td>
      </tr>`;
  }
}

/* ============================================
   REFRESH ALL DATA
   ============================================ */
async function refreshAll() {
  await Promise.all([
    loadStats(),
    loadRecentWithdrawals(),
    loadRecentUsers()
  ]);
}

/* ============================================
   STOP AUTO-REFRESH
   ============================================ */
function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
    console.log('[Dashboard] Auto-refresh stopped');
  }
}

/* ============================================
   SETUP DASHBOARD
   ============================================ */
async function setupDashboard() {
  if (isSetupDone) return;
  isSetupDone = true;

  console.log('[Dashboard] Loading data...');
  await refreshAll();

  const refreshBtn = $('refreshBtn');
  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = '1';
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.classList.add('spinning');
      try {
        await refreshAll();
      } finally {
        setTimeout(() => {
          refreshBtn.classList.remove('spinning');
        }, 600);
      }
    });
  }

  stopAutoRefresh();
  autoRefreshTimer = setInterval(() => {
    if (!document.hidden) {
      loadStats();
      loadRecentWithdrawals();
    }
  }, 60 * 1000);
}

/* ============================================
   WAIT FOR ADMIN AUTH + LOAD DATA
   ============================================ */
window.addEventListener('adminReady', () => {
  console.log('[Dashboard] adminReady event received');
  setupDashboard();
});

/* ============================================
   CLEANUP ON LOGOUT / PAGE UNLOAD
   ============================================ */
window.addEventListener('beforeunload', stopAutoRefresh);

auth.onAuthStateChanged((user) => {
  if (!user) {
    stopAutoRefresh();
  }
});
