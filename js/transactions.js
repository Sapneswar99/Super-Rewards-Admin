/* ============================================
   SUPER REWARDS ADMIN — TRANSACTIONS
   All transactions + Search + Filter + Pagination
   v2 — Prevent duplicate setup + cleanup
   ============================================ */

import { auth, db } from './firebase-config.js';
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ============================================
   STATE
   ============================================ */
let allTransactions = [];
let filteredTransactions = [];
let lastDoc = null;
let hasMore = true;
let isLoading = false;
let currentFilter = 'all';
let searchTerm = '';
let isSetupDone = false;

const PAGE_SIZE = 25;

/* ============================================
   DOM HELPERS
   ============================================ */
const $ = (id) => document.getElementById(id);

function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  try {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return '—';
  }
}

function formatNumber(num) {
  return (Number(num) || 0).toLocaleString('en-IN');
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
   DETERMINE TRANSACTION CATEGORY
   ============================================ */
function getTxCategory(tx) {
  const type = (tx.type || '').toLowerCase();

  if (type.includes('withdrawal')) return 'withdrawal';
  if (type.includes('refund')) return 'refund';
  if (type.includes('admin')) return 'earned';
  return 'earned'; // Offers, surveys, etc.
}

function getTxIcon(tx) {
  const amount = Number(tx.amount) || 0;
  const category = getTxCategory(tx);

  if (amount > 0) {
    if (category === 'refund') {
      return {
        class: 'positive',
        svg: `<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>`
      };
    }
    return {
      class: 'positive',
      svg: `<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>`
    };
  }

  if (category === 'withdrawal') {
    return {
      class: 'negative',
      svg: `<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><circle cx="12" cy="14" r="1.5" fill="currentColor"/>`
    };
  }

  return {
    class: 'negative',
    svg: `<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>`
  };
}

/* ============================================
   LOAD TRANSACTIONS (paginated)
   ============================================ */
async function loadTransactions(reset = false) {
  if (isLoading) return;
  isLoading = true;

  const listEl = $('txList');
  const loadMoreWrap = $('loadMoreWrap');

  try {
    if (reset) {
      allTransactions = [];
      filteredTransactions = [];
      lastDoc = null;
      hasMore = true;
      if (listEl) {
        listEl.innerHTML = `
          <div class="admin-empty-state">
            <div class="admin-mini-spinner"></div>
            <p>Loading transactions...</p>
          </div>`;
      }
    }

    // Build query
    let q;
    if (lastDoc && !reset) {
      q = query(
        collection(db, 'transactions'),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
      );
    } else {
      q = query(
        collection(db, 'transactions'),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE)
      );
    }

    const snap = await getDocs(q);

    if (snap.empty) {
      hasMore = false;
      if (reset && allTransactions.length === 0) {
        updateStats();
        applyFilters();
      }
      if (loadMoreWrap) loadMoreWrap.classList.add('hidden');
      return;
    }

    lastDoc = snap.docs[snap.docs.length - 1];

    snap.forEach((docSnap) => {
      allTransactions.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    hasMore = snap.docs.length === PAGE_SIZE;

    updateStats();
    applyFilters();

    if (loadMoreWrap) {
      if (hasMore) {
        loadMoreWrap.classList.remove('hidden');
      } else {
        loadMoreWrap.classList.add('hidden');
      }
    }

  } catch (err) {
    console.error('Transactions load error:', err);

    if (err.code === 'failed-precondition' || err.message?.includes('index')) {
      if (listEl) {
        listEl.innerHTML = `
          <div class="admin-empty-state">
            <p>⚠️ Firestore index required.</p>
            <p style="font-size:12px;margin-top:8px;color:#8b95a8;">
              Please create the index from Firebase Console.
              <br>Check browser console for the direct link.
            </p>
          </div>`;
      }
    } else {
      if (listEl && reset) {
        listEl.innerHTML = `
          <div class="admin-empty-state">
            <p>Could not load transactions. Please refresh.</p>
          </div>`;
      }
    }
  } finally {
    isLoading = false;
  }
}

/* ============================================
   UPDATE STATS
   ============================================ */
function updateStats() {
  const totalTx = allTransactions.length;

  let coinsEarned = 0;
  let coinsSpent = 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  let todayCount = 0;

  allTransactions.forEach((tx) => {
    const amount = Number(tx.amount) || 0;
    if (amount > 0) {
      coinsEarned += amount;
    } else {
      coinsSpent += Math.abs(amount);
    }

    try {
      const txDate = tx.createdAt?.toDate ? tx.createdAt.toDate() : null;
      if (txDate && txDate >= todayStart) {
        todayCount++;
      }
    } catch {}
  });

  const tEl = $('statTotalTx');
  const eEl = $('statCoinsEarned');
  const sEl = $('statCoinsSpent');
  const dEl = $('statTodayTx');

  if (tEl) tEl.textContent = formatNumber(totalTx);
  if (eEl) eEl.textContent = formatNumber(coinsEarned);
  if (sEl) sEl.textContent = formatNumber(coinsSpent);
  if (dEl) dEl.textContent = formatNumber(todayCount);
}

/* ============================================
   APPLY FILTERS + SEARCH
   ============================================ */
function applyFilters() {
  let result = [...allTransactions];

  if (currentFilter !== 'all') {
    result = result.filter(tx => getTxCategory(tx) === currentFilter);
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    result = result.filter(tx => {
      const type = (tx.type || '').toLowerCase();
      const email = (tx.userEmail || '').toLowerCase();
      const name = (tx.userName || '').toLowerCase();
      const txId = (tx.id || '').toLowerCase();
      const txIdRef = (tx.tx_id || '').toLowerCase();
      const proof = (tx.proof || '').toLowerCase();

      return type.includes(term) ||
             email.includes(term) ||
             name.includes(term) ||
             txId.includes(term) ||
             txIdRef.includes(term) ||
             proof.includes(term);
    });
  }

  filteredTransactions = result;
  renderTransactions();
}

/* ============================================
   RENDER TRANSACTIONS
   ============================================ */
function renderTransactions() {
  const listEl = $('txList');
  if (!listEl) return;

  if (filteredTransactions.length === 0) {
    let msg = 'No transactions found';
    if (searchTerm) msg = `No results for "${escapeHtml(searchTerm)}"`;
    else if (currentFilter === 'earned') msg = 'No earned transactions yet';
    else if (currentFilter === 'withdrawal') msg = 'No withdrawal transactions yet';
    else if (currentFilter === 'refund') msg = 'No refunds yet';

    listEl.innerHTML = `
      <div class="admin-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        <p>${msg}</p>
      </div>`;
    return;
  }

  listEl.innerHTML = '';
  filteredTransactions.forEach((tx) => {
    listEl.appendChild(createTxCard(tx));
  });
}

/* ============================================
   CREATE TRANSACTION CARD
   ============================================ */
function createTxCard(tx) {
  const card = document.createElement('div');
  card.className = 'admin-tx-card';

  const amount = Number(tx.amount) || 0;
  const isPositive = amount > 0;
  const icon = getTxIcon(tx);

  const status = (tx.status || 'pending').toLowerCase();
  const dateTime = formatDateTime(tx.createdAt);
  const typeLabel = tx.type || 'Transaction';

  let subInfo = '';
  if (tx.userEmail) {
    subInfo = tx.userEmail;
  } else if (tx.userId) {
    subInfo = `User: ${tx.userId.slice(0, 12)}...`;
  } else {
    subInfo = 'System';
  }

  const refLine = tx.tx_id || tx.proof || '';
  const showRef = refLine && refLine.length < 60;

  card.innerHTML = `
    <div class="admin-tx-icon ${icon.class}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        ${icon.svg}
      </svg>
    </div>

    <div class="admin-tx-body">
      <div class="admin-tx-title">${escapeHtml(typeLabel)}</div>
      <div class="admin-tx-sub">${escapeHtml(subInfo)}</div>
      ${showRef ? `<div class="admin-tx-sub" style="font-size:10px;opacity:0.7;margin-top:2px;">🔖 ${escapeHtml(refLine)}</div>` : ''}
    </div>

    <div class="admin-tx-right">
      <div class="admin-tx-amount ${isPositive ? 'positive' : 'negative'}">
        ${isPositive ? '+' : ''}${formatNumber(amount)}
      </div>
      <div class="admin-tx-status ${status}">${status}</div>
      <div style="font-size:10px;color:#8b95a8;margin-top:4px;white-space:nowrap;">
        ${dateTime}
      </div>
    </div>
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
  const input = $('txSearchInput');
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
   SETUP: LOAD MORE BUTTON (Once)
   ============================================ */
function setupLoadMore() {
  const btn = $('loadMoreBtn');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';

  btn.addEventListener('click', async () => {
    if (isLoading || !hasMore) return;

    btn.disabled = true;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
      <div class="admin-mini-spinner" style="width:16px;height:16px;margin:0;border-width:2px;"></div>
      <span>Loading...</span>`;

    await loadTransactions(false);

    btn.disabled = false;
    btn.innerHTML = originalHTML;
  });
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
      await loadTransactions(true);
    } finally {
      setTimeout(() => {
        refreshBtn.classList.remove('spinning');
      }, 600);
    }
  });
}

/* ============================================
   SETUP TRANSACTIONS PAGE (Once)
   ============================================ */
async function setupTransactions() {
  if (isSetupDone) {
    console.log('[Transactions] Already setup — skipping');
    return;
  }
  isSetupDone = true;

  console.log('[Transactions] Loading transactions...');

  setupFilterTabs();
  setupSearch();
  setupLoadMore();
  setupRefreshButton();

  await loadTransactions(true);
}

/* ============================================
   INIT AFTER AUTH
   ============================================ */
window.addEventListener('adminReady', () => {
  console.log('[Transactions] adminReady event received');
  setupTransactions();
});
