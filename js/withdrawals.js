/* ============================================
   SUPER REWARDS ADMIN — REDEMPTIONS
   Approve / Reject + Filter + Real-time
   v3 — Fixed collection names, status cases, & fields
   ============================================ */

import { auth, db } from './firebase-config.js';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  runTransaction,
  serverTimestamp,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ============================================
   STATE
   ============================================ */
let allWithdrawals = [];
let currentFilter = 'PENDING'; // App uses uppercase
let pendingApprove = null;
let pendingReject = null;
let isSetupDone = false;

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

// App UPPERCASE me method bhejta hai
function getMethodLabel(method) {
  const m = String(method).toUpperCase();
  if (m === 'GOOGLE_PLAY') return 'Google Play';
  if (m === 'AMAZON_PAY') return 'Amazon Pay';
  return 'UPI';
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
   LOAD ALL REDEMPTIONS
   ============================================ */
async function loadWithdrawals() {
  const listEl = $('withdrawalsList');
  if (!listEl) return;

  try {
    listEl.innerHTML = `
      <div class="admin-empty-state">
        <div class="admin-mini-spinner"></div>
        <p>Loading redemptions...</p>
      </div>`;

    // FIX: collection 'redemptions'
    const q = query(
      collection(db, 'redemptions'),
      orderBy('createdAt', 'desc')
    );

    const snap = await getDocs(q);
    allWithdrawals = [];

    snap.forEach((docSnap) => {
      allWithdrawals.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    updateCounts();
    renderWithdrawals();

  } catch (err) {
    console.error('Redemptions load error:', err);
    listEl.innerHTML = `
      <div class="admin-empty-state">
        <p>Could not load redemptions. Please refresh.</p>
      </div>`;
  }
}

/* ============================================
   UPDATE FILTER COUNTS
   ============================================ */
function updateCounts() {
  const pending = allWithdrawals.filter(w => w.status === 'PENDING').length;
  const approved = allWithdrawals.filter(w => w.status === 'PAID').length;
  const rejected = allWithdrawals.filter(w => w.status === 'REJECTED').length;
  const all = allWithdrawals.length;

  const cp = $('countPending');
  const ca = $('countApproved');
  const cr = $('countRejected');
  const cl = $('countAll');

  if (cp) cp.textContent = pending;
  if (ca) ca.textContent = approved;
  if (cr) cr.textContent = rejected;
  if (cl) cl.textContent = all;

  const badge = $('navPendingBadge');
  if (badge) {
    if (pending > 0) {
      badge.textContent = pending > 99 ? '99+' : pending;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

/* ============================================
   RENDER REDEMPTIONS
   ============================================ */
function renderWithdrawals() {
  const listEl = $('withdrawalsList');
  if (!listEl) return;

  let filtered = allWithdrawals;

  if (currentFilter !== 'ALL') {
    filtered = allWithdrawals.filter(w => w.status === currentFilter);
  }

  if (filtered.length === 0) {
    const emptyMsg = currentFilter === 'PENDING'
      ? 'No pending redemptions 🎉'
      : `No ${currentFilter.toLowerCase()} redemptions`;

    listEl.innerHTML = `
      <div class="admin-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <p>${emptyMsg}</p>
      </div>`;
    return;
  }

  listEl.innerHTML = '';
  filtered.forEach((w) => {
    listEl.appendChild(createWithdrawalCard(w));
  });
}

/* ============================================
   CREATE REDEMPTION CARD
   ============================================ */
function createWithdrawalCard(w) {
  const card = document.createElement('div');
  card.className = 'admin-wd-card';

  const status = (w.status || 'PENDING').toUpperCase();
  const methodLabel = getMethodLabel(w.method);
  const dateTime = formatDateTime(w.createdAt);

  // FIX: App fields (upiId, gpEmail, amazonContact)
  let paymentLabel = 'UPI ID';
  let paymentValue = w.upiId || '—';

  if (w.method === 'GOOGLE_PLAY') {
    paymentLabel = 'Email';
    paymentValue = w.gpEmail || '—';
  } else if (w.method === 'AMAZON_PAY') {
    paymentLabel = 'Contact';
    paymentValue = w.amazonContact || '—';
  }
  
  // Fallback for user details if not saved in redemption doc
  const displayName = w.userName || w.userId || 'User';
  const displayEmail = w.userEmail || '—';

  const actionsHTML = status === 'PENDING' ? `
    <div class="admin-wd-actions">
      <button class="admin-wd-btn approve" data-action="approve" data-id="${w.id}" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Approve
      </button>
      <button class="admin-wd-btn reject" data-action="reject" data-id="${w.id}" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Reject
      </button>
    </div>` : '';

  let proofHTML = '';
  if (status === 'PAID' && w.proof) {
    proofHTML = `
      <div style="margin-bottom:12px;padding:10px 14px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:10px;font-size:12px;color:#10b981;">
        <strong style="opacity:0.75;">UTR / Code:</strong> ${escapeHtml(w.proof)}
      </div>`;
  } else if (status === 'REJECTED' && w.proof) {
    proofHTML = `
      <div style="margin-bottom:12px;padding:10px 14px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;font-size:12px;color:#ef4444;">
        <strong style="opacity:0.75;">Reason:</strong> ${escapeHtml(w.proof)}
      </div>`;
  }

  card.innerHTML = `
    <div class="admin-wd-header">
      <div class="admin-wd-user">
        <div class="admin-wd-avatar">${escapeHtml(getInitial(displayName))}</div>
        <div class="admin-wd-user-info">
          <div class="admin-wd-name">${escapeHtml(displayName)}</div>
          <div class="admin-wd-email">${escapeHtml(displayEmail)}</div>
        </div>
      </div>
      <span class="admin-wd-status ${status.toLowerCase()}">${status}</span>
    </div>

    <div class="admin-wd-details">
      <div class="admin-wd-detail">
        <div class="admin-wd-detail-label">Coins</div>
        <div class="admin-wd-detail-value">${formatNumber(w.coins)}</div>
      </div>
      <div class="admin-wd-detail">
        <div class="admin-wd-detail-label">Amount</div>
        <div class="admin-wd-detail-value amount">₹${w.amountINR || 0}</div>
      </div>
      <div class="admin-wd-detail">
        <div class="admin-wd-detail-label">Method</div>
        <div class="admin-wd-detail-value">${methodLabel}</div>
      </div>
      <div class="admin-wd-detail">
        <div class="admin-wd-detail-label">${paymentLabel}</div>
        <div class="admin-wd-detail-value">${escapeHtml(paymentValue)}</div>
      </div>
      <div class="admin-wd-detail" style="grid-column:1/-1;">
        <div class="admin-wd-detail-label">Requested</div>
        <div class="admin-wd-detail-value" style="font-weight:500;font-size:12px;color:#8b95a8;">${dateTime}</div>
      </div>
    </div>

    ${proofHTML}
    ${actionsHTML}
  `;

  return card;
}

/* ============================================
   SETUP: FILTER TABS
   ============================================ */
function setupFilterTabs() {
  document.querySelectorAll('.admin-filter-tab').forEach((tab) => {
    if (tab.dataset.bound === '1') return;
    tab.dataset.bound = '1';

    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // HTML me data-filter="pending" hoga, use capital me convert karenge
      const rawFilter = tab.dataset.filter;
      currentFilter = rawFilter.toUpperCase();
      
      renderWithdrawals();
    });
  });
}

/* ============================================
   SETUP: CARD ACTIONS (Event Delegation)
   ============================================ */
function setupCardActions() {
  const listEl = $('withdrawalsList');
  if (!listEl || listEl.dataset.bound === '1') return;
  listEl.dataset.bound = '1';

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;

    const w = allWithdrawals.find(item => item.id === id);
    if (!w) return;

    if (action === 'approve') {
      openApproveSheet(w);
    } else if (action === 'reject') {
      openRejectSheet(w);
    }
  });
}

/* ============================================
   APPROVE SHEET
   ============================================ */
function openApproveSheet(w) {
  pendingApprove = w;

  const sheet = $('approveSheet');
  if (!sheet) return;

  const userEl = $('approveUser');
  const amountEl = $('approveAmount');
  const upiEl = $('approveUpi');
  const emailEl = $('approveEmail');
  const upiRow = $('approveUpiRow');
  const emailRow = $('approveEmailRow');
  const proofLabel = $('approveProofLabel');

  if (userEl) userEl.textContent = w.userName || w.userId || 'User';
  if (amountEl) amountEl.textContent = `₹${w.amountINR || 0} (${formatNumber(w.coins)} coins)`;

  if (w.method === 'UPI') {
    if (upiRow) upiRow.classList.remove('hidden');
    if (emailRow) emailRow.classList.add('hidden');
    if (upiEl) upiEl.textContent = w.upiId || '—';
    if (proofLabel) proofLabel.innerHTML = 'UTR / Transaction ID <span class="admin-required">*</span>';
  } else {
    if (upiRow) upiRow.classList.add('hidden');
    if (emailRow) emailRow.classList.remove('hidden');
    if (emailEl) emailEl.textContent = w.method === 'GOOGLE_PLAY' ? (w.gpEmail || '—') : (w.amazonContact || '—');
    if (proofLabel) proofLabel.innerHTML = 'Gift Card Code <span class="admin-required">*</span>';
  }

  const input = $('approveProofInput');
  if (input) input.value = '';

  const errEl = $('approveError');
  if (errEl) errEl.textContent = '';

  sheet.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  setTimeout(() => input?.focus(), 200);
}

function closeApproveSheet() {
  const sheet = $('approveSheet');
  if (sheet) sheet.classList.add('hidden');
  document.body.style.overflow = '';
  pendingApprove = null;
}

function setupApproveSheet() {
  const sheet = $('approveSheet');
  if (!sheet || sheet.dataset.bound === '1') return;
  sheet.dataset.bound = '1';

  const closeBtn = $('approveSheetClose');
  const cancelBtn = $('approveCancelBtn');
  const confirmBtn = $('approveConfirmBtn');
  const input = $('approveProofInput');
  const errEl = $('approveError');

  if (closeBtn) closeBtn.addEventListener('click', closeApproveSheet);
  if (cancelBtn) cancelBtn.addEventListener('click', closeApproveSheet);

  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) closeApproveSheet();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.classList.contains('hidden')) {
      closeApproveSheet();
    }
  });

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      if (!pendingApprove) return;

      const proof = (input?.value || '').trim();
      if (!proof) {
        if (errEl) errEl.textContent = 'UTR / Code is required.';
        return;
      }

      const w = pendingApprove;
      confirmBtn.disabled = true;
      showLoading('Approving redemption...');

      try {
        await runTransaction(db, async (tx) => {
          const wRef = doc(db, 'redemptions', w.id); // FIX
          const wSnap = await tx.get(wRef);

          if (!wSnap.exists()) throw new Error('Redemption not found');
          if (wSnap.data().status !== 'PENDING') { // FIX
            throw new Error('Already processed');
          }

          tx.update(wRef, {
            status: 'PAID', // FIX
            proof: proof,
            utr: proof, // App rules me utr bhi hai
            processedAt: serverTimestamp(),
            adminNote: 'Approved by Admin'
          });
        });

        const idx = allWithdrawals.findIndex(x => x.id === w.id);
        if (idx !== -1) {
          allWithdrawals[idx].status = 'PAID';
          allWithdrawals[idx].proof = proof;
        }

        hideLoading();
        closeApproveSheet();
        updateCounts();
        renderWithdrawals();

        setTimeout(() => {
          alert(`✅ Redemption of ₹${w.amountINR} approved!`);
        }, 200);

      } catch (err) {
        console.error('Approve error:', err);
        hideLoading();
        confirmBtn.disabled = false;

        if (errEl) {
          if (err.message === 'Already processed') {
            errEl.textContent = 'This redemption was already processed.';
          } else {
            errEl.textContent = err.message || 'Approve failed. Try again.';
          }
        }
      }
    });
  }
}

/* ============================================
   REJECT SHEET
   ============================================ */
function openRejectSheet(w) {
  pendingReject = w;

  const sheet = $('rejectSheet');
  if (!sheet) return;

  const userEl = $('rejectUser');
  const amountEl = $('rejectAmount');
  const input = $('rejectReasonInput');
  const errEl = $('rejectError');

  if (userEl) userEl.textContent = w.userName || w.userId || 'User';
  if (amountEl) amountEl.textContent = `₹${w.amountINR || 0} (${formatNumber(w.coins)} coins)`;
  if (input) input.value = '';
  if (errEl) errEl.textContent = '';

  sheet.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  setTimeout(() => input?.focus(), 200);
}

function closeRejectSheet() {
  const sheet = $('rejectSheet');
  if (sheet) sheet.classList.add('hidden');
  document.body.style.overflow = '';
  pendingReject = null;
}

function setupRejectSheet() {
  const sheet = $('rejectSheet');
  if (!sheet || sheet.dataset.bound === '1') return;
  sheet.dataset.bound = '1';

  const closeBtn = $('rejectSheetClose');
  const cancelBtn = $('rejectCancelBtn');
  const confirmBtn = $('rejectConfirmBtn');
  const input = $('rejectReasonInput');
  const errEl = $('rejectError');

  if (closeBtn) closeBtn.addEventListener('click', closeRejectSheet);
  if (cancelBtn) cancelBtn.addEventListener('click', closeRejectSheet);

  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) closeRejectSheet();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.classList.contains('hidden')) {
      closeRejectSheet();
    }
  });

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      if (!pendingReject) return;

      const reason = (input?.value || '').trim() || 'Rejected by admin';
      const w = pendingReject;

      const confirmMsg =
        `Reject this redemption?\n\n` +
        `User: ${w.userName || w.userId}\n` +
        `Amount: ₹${w.amountINR} (${formatNumber(w.coins)} coins)\n\n` +
        `⚠️ ${formatNumber(w.coins)} coins will be REFUNDED to user.`;

      if (!window.confirm(confirmMsg)) return;

      confirmBtn.disabled = true;
      showLoading('Rejecting & refunding coins...');

      try {
        await runTransaction(db, async (tx) => {
          const userRef = doc(db, 'users', w.userId);
          const userSnap = await tx.get(userRef);

          if (!userSnap.exists()) throw new Error('User not found');

          const uData = userSnap.data();

          const wRef = doc(db, 'redemptions', w.id); // FIX
          const wSnap = await tx.get(wRef);

          if (!wSnap.exists()) throw new Error('Redemption not found');
          if (wSnap.data().status !== 'PENDING') { // FIX
            throw new Error('Already processed');
          }

          tx.update(wRef, {
            status: 'REJECTED', // FIX
            proof: reason,
            adminNote: reason,
            processedAt: serverTimestamp()
          });

          // ✅ REFUND coins
          tx.update(userRef, {
            coins: (Number(uData.coins) || 0) + Number(w.coins),
            pendingCoins: Math.max(0, (Number(uData.pendingCoins) || 0) - Number(w.coins))
          });
        });

        // Create refund transaction log
        try {
          await addDoc(collection(db, 'transactions'), {
            uid: w.userId, // FIX: app me uid use hota hai
            type: 'Refund (rejected)',
            amount: Number(w.coins),
            status: 'CREDIT',
            reason: reason,
            processedAt: serverTimestamp(),
            createdAt: serverTimestamp()
          });
        } catch (logErr) {
          console.warn('Transaction log update failed:', logErr);
        }

        const idx = allWithdrawals.findIndex(x => x.id === w.id);
        if (idx !== -1) {
          allWithdrawals[idx].status = 'REJECTED';
          allWithdrawals[idx].proof = reason;
        }

        hideLoading();
        closeRejectSheet();
        updateCounts();
        renderWithdrawals();

        setTimeout(() => {
          alert(`✅ Redemption rejected.\n${formatNumber(w.coins)} coins refunded.`);
        }, 200);

      } catch (err) {
        console.error('Reject error:', err);
        hideLoading();
        confirmBtn.disabled = false;

        if (errEl) {
          if (err.message === 'Already processed') {
            errEl.textContent = 'This redemption was already processed.';
          } else {
            errEl.textContent = err.message || 'Reject failed. Try again.';
          }
        }
      }
    });
  }
}

/* ============================================
   SETUP: REFRESH BUTTON
   ============================================ */
function setupRefreshButton() {
  const refreshBtn = $('refreshBtn');
  if (!refreshBtn || refreshBtn.dataset.bound === '1') return;
  refreshBtn.dataset.bound = '1';

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.classList.add('spinning');
    try {
      await loadWithdrawals();
    } finally {
      setTimeout(() => {
        refreshBtn.classList.remove('spinning');
      }, 600);
    }
  });
}

/* ============================================
   SETUP REDEMPTIONS PAGE (Once)
   ============================================ */
async function setupWithdrawals() {
  if (isSetupDone) {
    console.log('[Redemptions] Already setup — skipping');
    return;
  }
  isSetupDone = true;

  console.log('[Redemptions] Loading redemptions...');

  setupFilterTabs();
  setupCardActions();
  setupApproveSheet();
  setupRejectSheet();
  setupRefreshButton();

  await loadWithdrawals();
}

/* ============================================
   INIT AFTER AUTH
   ============================================ */
window.addEventListener('adminReady', () => {
  console.log('[Redemptions] adminReady event received');
  setupWithdrawals();
});
