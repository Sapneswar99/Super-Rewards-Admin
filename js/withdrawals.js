/* ============================================
   SUPER REWARDS ADMIN — REDEMPTIONS
   Approve / Reject + Filter + Real-time
   v5 — Added Request ID & Copy Button
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
let currentFilter = 'PENDING'; 
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

  const amountINR = w.amountINR || Math.floor((w.coins || 0) / 100);

  let paymentLabel = 'UPI ID';
  let paymentValue = w.upiId || '—';

  if (w.method === 'GOOGLE_PLAY') {
    paymentLabel = 'Email';
    paymentValue = w.gpEmail || '—';
  } else if (w.method === 'AMAZON_PAY') {
    paymentLabel = 'Contact';
    paymentValue = w.amazonContact || '—';
  }
  
  const displayName = w.userName || w.userId || w.uid || 'User';
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

  // ✅ NAYA: Request ID aur Copy Button
  const reqIdHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 8px; margin-bottom: 16px; padding-top: 12px; border-top: 1px dashed rgba(255,255,255,0.1);">
      <div style="font-size: 11px; color: #8b95a8;">
        REQ ID: <span style="font-family: monospace; color:#cbd5e1;">${w.id}</span>
      </div>
      <button data-action="copy-id" data-id="${w.id}" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #cbd5e1; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span class="copy-text">Copy ID</span>
      </button>
    </div>
  `;

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
        <div class="admin-wd-detail-value amount">₹${amountINR}</div>
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

    ${reqIdHTML}
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
      
      const rawFilter = tab.dataset.filter;
      currentFilter = rawFilter.toUpperCase();
      
      renderWithdrawals();
    });
  });
}

/* ============================================
   SETUP: CARD ACTIONS (Approve/Reject/Copy)
   ============================================ */
function setupCardActions() {
  const listEl = $('withdrawalsList');
  if (!listEl || listEl.dataset.bound === '1') return;
  listEl.dataset.bound = '1';

  listEl.addEventListener('click', (e) => {
    // Check if clicked inside the Copy button
    const copyBtn = e.target.closest('[data-action="copy-id"]');
    if (copyBtn) {
      const idToCopy = copyBtn.dataset.id;
      navigator.clipboard.writeText(idToCopy).then(() => {
        const textSpan = copyBtn.querySelector('.copy-text');
        const originalText = textSpan.textContent;
        textSpan.textContent = 'Copied!';
        copyBtn.style.background = 'rgba(16,185,129,0.2)';
        copyBtn.style.color = '#10b981';
        copyBtn.style.borderColor = 'rgba(16,185,129,0.3)';
        
        setTimeout(() => {
          textSpan.textContent = originalText;
          copyBtn.style.background = 'rgba(255,255,255,0.05)';
          copyBtn.style.color = '#cbd5e1';
          copyBtn.style.borderColor = 'rgba(255,255,255,0.1)';
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy: ', err);
        alert('Failed to copy ID. Please select manually.');
      });
      return; // Stop here so it doesn't trigger approve/reject
    }

    // Check if clicked Approve or Reject
    const actionBtn = e.target.closest('[data-action="approve"], [data-action="reject"]');
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    const id = actionBtn.dataset.id;

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

  const displayName = w.userName || w.userId || w.uid || 'User';
  const amountINR = w.amountINR || Math.floor((w.coins || 0) / 100);

  if (userEl) userEl.textContent = displayName;
  if (amountEl) amountEl.textContent = `₹${amountINR} (${formatNumber(w.coins)} coins)`;

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
          const wRef = doc(db, 'redemptions', w.id);
          const wSnap = await tx.get(wRef);

          if (!wSnap.exists()) throw new Error('Redemption not found');
          if (wSnap.data().status !== 'PENDING') {
            throw new Error('Already processed');
          }

          tx.update(wRef, {
            status: 'PAID',
            proof: proof,
            utr: proof,
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
          alert(`✅ Redemption approved!`);
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

  const displayName = w.userName || w.userId || w.uid || 'User';
  const amountINR = w.amountINR || Math.floor((w.coins || 0) / 100);

  if (userEl) userEl.textContent = displayName;
  if (amountEl) amountEl.textContent = `₹${amountINR} (${formatNumber(w.coins)} coins)`;
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

      const targetUid = w.userId || w.uid;
      if (!targetUid) {
        if (errEl) errEl.textContent = 'Error: User ID is missing in this request.';
        return;
      }

      const confirmMsg =
        `Reject this redemption?\n\n` +
        `User: ${w.userName || targetUid}\n` +
        `Amount: ₹${w.amountINR || Math.floor((w.coins || 0) / 100)}\n\n` +
        `⚠️ ${formatNumber(w.coins)} coins will be REFUNDED to user.`;

      if (!window.confirm(confirmMsg)) return;

      confirmBtn.disabled = true;
      showLoading('Rejecting & refunding coins...');

      try {
        await runTransaction(db, async (tx) => {
          const userRef = doc(db, 'users', targetUid);
          const userSnap = await tx.get(userRef);

          if (!userSnap.exists()) throw new Error('User not found');

          const uData = userSnap.data();

          const wRef = doc(db, 'redemptions', w.id);
          const wSnap = await tx.get(wRef);

          if (!wSnap.exists()) throw new Error('Redemption not found');
          if (wSnap.data().status !== 'PENDING') {
            throw new Error('Already processed');
          }

          tx.update(wRef, {
            status: 'REJECTED',
            proof: reason,
            adminNote: reason,
            processedAt: serverTimestamp()
          });

          tx.update(userRef, {
            coins: (Number(uData.coins) || 0) + Number(w.coins || 0),
            pendingCoins: Math.max(0, (Number(uData.pendingCoins) || 0) - Number(w.coins || 0))
          });
        });

        try {
          await addDoc(collection(db, 'transactions'), {
            uid: targetUid,
            type: 'Refund (rejected)',
            amount: Number(w.coins || 0),
            status: 'COMPLETED',
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
