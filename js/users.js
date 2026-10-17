/* ============================================
   SUPER REWARDS ADMIN — USERS
   Search + Filter + User Details + Coins + Ban
   v3 — Fixed transaction field names (uid)
   ============================================ */

import { auth, db } from './firebase-config.js';
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  runTransaction,
  serverTimestamp,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ============================================
   STATE
   ============================================ */
let allUsers = [];
let filteredUsers = [];
let currentFilter = 'all';
let searchTerm = '';
let selectedUser = null;
let coinsAction = 'add'; // 'add' or 'set'
let isSetupDone = false;

/* ============================================
   DOM HELPERS
   ============================================ */
const $ = (id) => document.getElementById(id);

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

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

/* ============================================
   LOAD ALL USERS
   ============================================ */
async function loadUsers() {
  const listEl = $('usersList');
  if (!listEl) return;

  try {
    listEl.innerHTML = `
      <div class="admin-empty-state">
        <div class="admin-mini-spinner"></div>
        <p>Loading users...</p>
      </div>`;

    const q = query(
      collection(db, 'users'),
      orderBy('createdAt', 'desc')
    );

    const snap = await getDocs(q);
    allUsers = [];

    snap.forEach((docSnap) => {
      allUsers.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    updateStats();
    applyFilters();

  } catch (err) {
    console.error('Users load error:', err);
    listEl.innerHTML = `
      <div class="admin-empty-state">
        <p>Could not load users. Please refresh.</p>
      </div>`;
  }
}

/* ============================================
   UPDATE STATS
   ============================================ */
function updateStats() {
  const total = allUsers.length;
  const active = allUsers.filter(u => !u.isBanned).length;
  const banned = allUsers.filter(u => u.isBanned).length;
  const totalCoins = allUsers.reduce((sum, u) => sum + (Number(u.coins) || 0), 0);

  const tEl = $('statTotalUsers');
  const aEl = $('statActiveUsers');
  const bEl = $('statBannedUsers');
  const cEl = $('statTotalCoins');

  if (tEl) tEl.textContent = formatNumber(total);
  if (aEl) aEl.textContent = formatNumber(active);
  if (bEl) bEl.textContent = formatNumber(banned);
  if (cEl) cEl.textContent = formatNumber(totalCoins);

  // Filter tab counts
  const cAll = $('countAllUsers');
  const cActive = $('countActiveUsers');
  const cBanned = $('countBannedUsers');
  if (cAll) cAll.textContent = total;
  if (cActive) cActive.textContent = active;
  if (cBanned) cBanned.textContent = banned;
}

/* ============================================
   APPLY FILTERS + SEARCH
   ============================================ */
function applyFilters() {
  let result = [...allUsers];

  if (currentFilter === 'active') {
    result = result.filter(u => !u.isBanned);
  } else if (currentFilter === 'banned') {
    result = result.filter(u => u.isBanned);
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    result = result.filter(u => {
      const name = (u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }

  filteredUsers = result;
  renderUsers();
}

/* ============================================
   RENDER USERS LIST
   ============================================ */
function renderUsers() {
  const listEl = $('usersList');
  if (!listEl) return;

  if (filteredUsers.length === 0) {
    let msg = 'No users found';
    if (searchTerm) msg = `No users matching "${escapeHtml(searchTerm)}"`;
    else if (currentFilter === 'banned') msg = 'No banned users 🎉';
    else if (currentFilter === 'active') msg = 'No active users';

    listEl.innerHTML = `
      <div class="admin-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
        </svg>
        <p>${msg}</p>
      </div>`;
    return;
  }

  listEl.innerHTML = '';
  filteredUsers.forEach((u) => {
    listEl.appendChild(createUserCard(u));
  });
}

/* ============================================
   CREATE USER CARD
   ============================================ */
function createUserCard(u) {
  const card = document.createElement('div');
  card.className = 'admin-user-card' + (u.isBanned ? ' banned' : '');
  card.dataset.userId = u.id;

  const initial = getInitial(u.name);
  const coins = formatNumber(u.coins);
  const joinDate = formatDate(u.createdAt);

  card.innerHTML = `
    <div class="admin-wd-avatar${u.isBanned ? ' banned' : ''}">${escapeHtml(initial)}</div>
    <div class="admin-user-body">
      <div class="admin-user-name-row">
        <span class="admin-user-name">${escapeHtml(u.name || 'User')}</span>
        <span class="admin-user-badge-tag ${u.isBanned ? 'banned' : 'active'}">
          ${u.isBanned ? 'Banned' : 'Active'}
        </span>
      </div>
      <div class="admin-user-email-row">${escapeHtml(u.email || '—')}</div>
      <div class="admin-user-meta-row">
        <span>💰 <strong>${coins}</strong> coins</span>
        <span>📅 ${joinDate}</span>
      </div>
    </div>
    <svg class="admin-user-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  `;

  return card;
}

/* ============================================
   SETUP: FILTER TABS (Once)
   ============================================ */
function setupFilterTabs() {
  document.querySelectorAll('.admin-filter-tab').forEach((tab) => {
    if (tab.dataset.bound === '1') return;
    tab.dataset.bound = '1';

    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      applyFilters();
    });
  });
}

/* ============================================
   SETUP: SEARCH BAR (Once)
   ============================================ */
function setupSearch() {
  const input = $('userSearchInput');
  if (!input || input.dataset.bound === '1') return;
  input.dataset.bound = '1';

  let debounceTimer;
  input.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchTerm = (e.target.value || '').trim().toLowerCase();
      applyFilters();
    }, 250);
  });
}

/* ============================================
   SETUP: USER CARD CLICK (Once)
   ============================================ */
function setupUserCardClick() {
  const listEl = $('usersList');
  if (!listEl || listEl.dataset.bound === '1') return;
  listEl.dataset.bound = '1';

  listEl.addEventListener('click', (e) => {
    const card = e.target.closest('.admin-user-card');
    if (!card) return;
    const uid = card.dataset.userId;
    const user = allUsers.find(u => u.id === uid);
    if (user) openUserSheet(user);
  });
}

/* ============================================
   USER DETAILS SHEET
   ============================================ */
function openUserSheet(u) {
  selectedUser = u;

  const sheet = $('userSheet');
  if (!sheet) return;

  const avatarEl = $('sheetUserAvatar');
  if (avatarEl) {
    avatarEl.textContent = getInitial(u.name);
    avatarEl.style.background = u.isBanned
      ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
      : '';
  }

  const nameEl = $('sheetUserName');
  const emailEl = $('sheetUserEmail');
  const statusEl = $('sheetUserStatus');

  if (nameEl) nameEl.textContent = u.name || 'User';
  if (emailEl) emailEl.textContent = u.email || '—';

  if (statusEl) {
    statusEl.textContent = u.isBanned ? 'Banned' : 'Active';
    statusEl.className = 'admin-user-status' + (u.isBanned ? ' banned' : '');
  }

  const phoneEl = $('sheetUserPhone');
  const upiEl = $('sheetUserUpi');
  const coinsEl = $('sheetUserCoins');
  const earnedEl = $('sheetUserEarned');
  const withdrawnEl = $('sheetUserWithdrawn');
  const joinedEl = $('sheetUserJoined');

  // App me phone aur upi direct user me nahi hote, par agar future me hon toh show hoga
  if (phoneEl) phoneEl.textContent = u.phone || '—';
  if (upiEl) upiEl.textContent = u.upiId || '—';
  
  if (coinsEl) coinsEl.textContent = formatNumber(u.coins);
  if (earnedEl) earnedEl.textContent = formatNumber(u.totalEarned);
  if (withdrawnEl) withdrawnEl.textContent = '₹' + (Number(u.totalWithdrawn) || 0);
  if (joinedEl) joinedEl.textContent = formatDate(u.createdAt);

  const banText = $('btnToggleBanText');
  if (banText) {
    banText.textContent = u.isBanned ? 'Unban User' : 'Ban User';
  }

  const banBtn = $('btnToggleBan');
  if (banBtn) {
    if (u.isBanned) banBtn.classList.add('unban');
    else banBtn.classList.remove('unban');
  }

  sheet.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeUserSheet() {
  const sheet = $('userSheet');
  if (sheet) sheet.classList.add('hidden');
  document.body.style.overflow = '';
  selectedUser = null;
}

/* ============================================
   SETUP: USER SHEET (Once)
   ============================================ */
function setupUserSheet() {
  const sheet = $('userSheet');
  if (!sheet || sheet.dataset.bound === '1') return;
  sheet.dataset.bound = '1';

  const closeBtn = $('userSheetClose');
  if (closeBtn) closeBtn.addEventListener('click', closeUserSheet);

  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) closeUserSheet();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.classList.contains('hidden')) {
      closeUserSheet();
    }
  });

  const addCoinsBtn = $('btnAddCoins');
  const setCoinsBtn = $('btnSetCoins');
  const toggleBanBtn = $('btnToggleBan');

  if (addCoinsBtn) {
    addCoinsBtn.addEventListener('click', () => {
      if (!selectedUser) return;
      openCoinsSheet('add');
    });
  }

  if (setCoinsBtn) {
    setCoinsBtn.addEventListener('click', () => {
      if (!selectedUser) return;
      openCoinsSheet('set');
    });
  }

  if (toggleBanBtn) {
    toggleBanBtn.addEventListener('click', handleToggleBan);
  }
}

/* ============================================
   COINS SHEET
   ============================================ */
function openCoinsSheet(action) {
  coinsAction = action;
  const u = selectedUser;
  if (!u) return;

  const sheet = $('coinsSheet');
  if (!sheet) return;

  const titleEl = $('coinsSheetTitle');
  const userEl = $('coinsUser');
  const currentEl = $('coinsCurrent');
  const input = $('coinsInput');
  const errEl = $('coinsError');

  if (titleEl) titleEl.textContent = action === 'add' ? 'Add Coins' : 'Set Coins';
  if (userEl) userEl.textContent = u.name || 'User';
  if (currentEl) currentEl.textContent = formatNumber(u.coins) + ' coins';
  if (input) {
    input.value = '';
    input.placeholder = action === 'add'
      ? 'Enter coins to add (e.g. 1000)'
      : 'Enter new total (e.g. 5000)';
  }
  if (errEl) errEl.textContent = '';

  sheet.classList.remove('hidden');
  setTimeout(() => input?.focus(), 200);
}

function closeCoinsSheet() {
  const sheet = $('coinsSheet');
  if (sheet) sheet.classList.add('hidden');
}

/* ============================================
   SETUP: COINS SHEET (Once)
   ============================================ */
function setupCoinsSheet() {
  const sheet = $('coinsSheet');
  if (!sheet || sheet.dataset.bound === '1') return;
  sheet.dataset.bound = '1';

  const closeBtn = $('coinsSheetClose');
  const cancelBtn = $('coinsCancelBtn');
  const confirmBtn = $('coinsConfirmBtn');
  const input = $('coinsInput');
  const errEl = $('coinsError');

  if (closeBtn) closeBtn.addEventListener('click', closeCoinsSheet);
  if (cancelBtn) cancelBtn.addEventListener('click', closeCoinsSheet);

  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) closeCoinsSheet();
  });

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      if (!selectedUser) return;

      const raw = (input?.value || '').trim();
      const amount = parseInt(raw, 10);

      if (!raw || isNaN(amount) || amount < 0) {
        if (errEl) errEl.textContent = 'Please enter a valid number.';
        return;
      }

      if (coinsAction === 'add' && amount <= 0) {
        if (errEl) errEl.textContent = 'Amount must be greater than 0.';
        return;
      }

      const u = selectedUser;
      const currentCoins = Number(u.coins) || 0;

      let newTotal;
      if (coinsAction === 'add') {
        newTotal = currentCoins + amount;
      } else {
        newTotal = amount;
      }

      if (coinsAction === 'set') {
        const ok = confirm(
          `Set ${u.name}'s coins to ${formatNumber(amount)}?\n\n` +
          `Current: ${formatNumber(currentCoins)}\n` +
          `Change: ${amount - currentCoins >= 0 ? '+' : ''}${formatNumber(amount - currentCoins)}`
        );
        if (!ok) return;
      }

      confirmBtn.disabled = true;
      showLoading(coinsAction === 'add' ? 'Adding coins...' : 'Setting coins...');

      try {
        const userRef = doc(db, 'users', u.id);

        await runTransaction(db, async (tx) => {
          const snap = await tx.get(userRef);
          if (!snap.exists()) throw new Error('User not found');

          const uData = snap.data();
          const current = Number(uData.coins) || 0;

          let newValue;
          if (coinsAction === 'add') {
            newValue = current + amount;
          } else {
            newValue = amount;
          }

          tx.update(userRef, {
            coins: newValue,
            ...(coinsAction === 'add' ? {
              totalEarned: (Number(uData.totalEarned) || 0) + amount,
              lifetimeCoins: (Number(uData.lifetimeCoins) || 0) + amount
            } : {})
          });
        });

        // Log transaction
        try {
          const delta = coinsAction === 'add' ? amount : (newTotal - currentCoins);
          await addDoc(collection(db, 'transactions'), {
            uid: u.id, // ✅ FIX: userId ki jagah uid
            type: coinsAction === 'add' ? 'ADMIN_CREDIT' : 'ADMIN_SET',
            amount: delta,
            status: 'COMPLETED',
            createdAt: serverTimestamp(),
            note: coinsAction === 'add'
              ? `Admin added ${formatNumber(amount)} coins`
              : `Admin set coins to ${formatNumber(amount)}`
          });
        } catch (logErr) {
          console.warn('Transaction log failed:', logErr);
        }

        // Update local data
        const idx = allUsers.findIndex(x => x.id === u.id);
        if (idx !== -1) {
          allUsers[idx].coins = newTotal;
          if (coinsAction === 'add') {
            allUsers[idx].totalEarned = (Number(allUsers[idx].totalEarned) || 0) + amount;
            allUsers[idx].lifetimeCoins = (Number(allUsers[idx].lifetimeCoins) || 0) + amount;
          }
          selectedUser = allUsers[idx];
        }

        hideLoading();
        closeCoinsSheet();

        updateStats();
        applyFilters();

        const coinsEl = $('sheetUserCoins');
        if (coinsEl) coinsEl.textContent = formatNumber(newTotal);
        const earnedEl = $('sheetUserEarned');
        if (earnedEl && coinsAction === 'add') {
          earnedEl.textContent = formatNumber(selectedUser.totalEarned);
        }

        setTimeout(() => {
          alert(coinsAction === 'add'
            ? `✅ Added ${formatNumber(amount)} coins to ${u.name}`
            : `✅ Coins set to ${formatNumber(newTotal)} for ${u.name}`);
        }, 200);

      } catch (err) {
        console.error('Coins update error:', err);
        hideLoading();
        confirmBtn.disabled = false;
        if (errEl) errEl.textContent = err.message || 'Update failed. Try again.';
      }
    });
  }
}

/* ============================================
   BAN / UNBAN
   ============================================ */
async function handleToggleBan() {
  if (!selectedUser) return;
  const u = selectedUser;
  const action = u.isBanned ? 'unban' : 'ban';

  const confirmMsg = action === 'ban'
    ? `Ban ${u.name}?\n\nThis user will not be able to login or withdraw.`
    : `Unban ${u.name}?\n\nThis user will regain full access.`;

  if (!confirm(confirmMsg)) return;

  showLoading(action === 'ban' ? 'Banning user...' : 'Unbanning user...');

  try {
    const userRef = doc(db, 'users', u.id);
    const newBanState = !u.isBanned;

    await updateDoc(userRef, {
      isBanned: newBanState,
      bannedAt: newBanState ? serverTimestamp() : null
    });

    const idx = allUsers.findIndex(x => x.id === u.id);
    if (idx !== -1) {
      allUsers[idx].isBanned = newBanState;
      selectedUser = allUsers[idx];
    }

    hideLoading();

    const statusEl = $('sheetUserStatus');
    if (statusEl) {
      statusEl.textContent = newBanState ? 'Banned' : 'Active';
      statusEl.className = 'admin-user-status' + (newBanState ? ' banned' : '');
    }

    const banText = $('btnToggleBanText');
    if (banText) {
      banText.textContent = newBanState ? 'Unban User' : 'Ban User';
    }

    const banBtn = $('btnToggleBan');
    if (banBtn) {
      if (newBanState) banBtn.classList.add('unban');
      else banBtn.classList.remove('unban');
    }

    const avatarEl = $('sheetUserAvatar');
    if (avatarEl) {
      avatarEl.style.background = newBanState
        ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
        : '';
    }

    updateStats();
    applyFilters();

    setTimeout(() => {
      alert(newBanState
        ? `⛔ ${u.name} has been banned.`
        : `✅ ${u.name} has been unbanned.`);
    }, 200);

  } catch (err) {
    console.error('Ban toggle error:', err);
    hideLoading();
    alert('Failed to update ban status. Try again.');
  }
}

/* ============================================
   SETUP: REFRESH BUTTON (Once)
   ============================================ */
function setupRefreshButton() {
  const refreshBtn = $('refreshBtn');
  if (!refreshBtn || refreshBtn.dataset.bound === '1') return;
  refreshBtn.dataset.bound = '1';

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.classList.add('spinning');
    try {
      await loadUsers();
    } finally {
      setTimeout(() => {
        refreshBtn.classList.remove('spinning');
      }, 600);
    }
  });
}

/* ============================================
   SETUP USERS PAGE (Once)
   ============================================ */
async function setupUsers() {
  if (isSetupDone) {
    console.log('[Users] Already setup — skipping');
    return;
  }
  isSetupDone = true;

  console.log('[Users] Loading users...');

  setupFilterTabs();
  setupSearch();
  setupUserCardClick();
  setupUserSheet();
  setupCoinsSheet();
  setupRefreshButton();

  await loadUsers();
}

/* ============================================
   INIT AFTER AUTH
   ============================================ */
window.addEventListener('adminReady', () => {
  console.log('[Users] adminReady event received');
  setupUsers();
});
