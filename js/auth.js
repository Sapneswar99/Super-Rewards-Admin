/* ============================================
   SUPER REWARDS ADMIN — AUTHENTICATION
   Robust page detection + logout + auth guard
   ============================================ */

import { auth, db, ADMIN_EMAILS, isAdminEmail } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ============================================
   DETECT PAGE TYPE
   ============================================ */
function detectPageType() {
  const path = window.location.pathname;
  const filename = path.split('/').filter(Boolean).pop() || 'index.html';
  const cleanName = filename.replace(/\.html?$/i, '').toLowerCase();

  const isLogin = cleanName === 'login';

  console.log('[Auth] Page detection:', {
    path: path,
    filename: filename,
    cleanName: cleanName,
    isLoginPage: isLogin
  });

  return {
    isLoginPage: isLogin,
    isAdminPage: !isLogin
  };
}

const { isLoginPage, isAdminPage } = detectPageType();

/* ============================================
   PASSWORD SHOW/HIDE TOGGLE
   ============================================ */
document.querySelectorAll('.admin-toggle-password').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;

    const eyeOpen = btn.querySelector('.eye-open');
    const eyeClosed = btn.querySelector('.eye-closed');

    if (input.type === 'password') {
      input.type = 'text';
      if (eyeOpen) eyeOpen.style.display = 'none';
      if (eyeClosed) eyeClosed.style.display = 'block';
      btn.setAttribute('aria-label', 'Hide password');
    } else {
      input.type = 'password';
      if (eyeOpen) eyeOpen.style.display = 'block';
      if (eyeClosed) eyeClosed.style.display = 'none';
      btn.setAttribute('aria-label', 'Show password');
    }
  });
});

/* ============================================
   GLOBAL LOGOUT HANDLER (Document Level)
   Works for any element with id="adminLogoutBtn"
   ============================================ */
let isLoggingOut = false;

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('#adminLogoutBtn');
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  if (isLoggingOut) {
    console.log('[Auth] Logout already in progress');
    return;
  }

  isLoggingOut = true;
  console.log('[Auth] Logout clicked');

  btn.disabled = true;
  btn.style.opacity = '0.5';

  const forceRedirect = () => {
    console.log('[Auth] Redirecting to login.html');
    window.location.replace('login.html');
  };

  try {
    await signOut(auth);
    console.log('[Auth] Signed out successfully');
  } catch (err) {
    console.error('[Auth] SignOut error:', err);
  }

  forceRedirect();
});

/* ============================================
   LOGIN PAGE LOGIC
   ============================================ */
if (isLoginPage) {

  const loginForm = document.getElementById('adminLoginForm');
  const emailInput = document.getElementById('adminEmail');
  const passwordInput = document.getElementById('adminPassword');
  const errorEl = document.getElementById('adminLoginError');
  const successEl = document.getElementById('adminLoginSuccess');
  const loginBtn = document.getElementById('adminLoginBtn');
  const loadingOverlay = document.getElementById('adminLoading');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (errorEl) errorEl.textContent = '';
      if (successEl) successEl.textContent = '';

      const email = (emailInput?.value || '').trim().toLowerCase();
      const password = passwordInput?.value || '';

      if (!email || !password) {
        if (errorEl) errorEl.textContent = 'Please fill all fields.';
        return;
      }

      if (!isAdminEmail(email)) {
        if (errorEl) errorEl.textContent = '⛔ Access denied. Not an admin account.';
        return;
      }

      setLoading(loginBtn, true, 'Signing in...');
      showOverlay(loadingOverlay, 'Verifying credentials...');

      try {
        const cred = await signInWithEmailAndPassword(auth, email, password);

        if (!isAdminEmail(cred.user.email)) {
          await signOut(auth);
          throw new Error('Admin access only');
        }

        // Log admin last login
        try {
          const adminRef = doc(db, 'admins', cred.user.uid);
          const adminSnap = await getDoc(adminRef);

          if (adminSnap.exists()) {
            await updateDoc(adminRef, { lastLogin: serverTimestamp() });
          } else {
            await setDoc(adminRef, {
              email: cred.user.email,
              createdAt: serverTimestamp(),
              lastLogin: serverTimestamp()
            });
          }
        } catch (logErr) {
          console.warn('Admin log update failed:', logErr);
        }

        if (successEl) successEl.textContent = '✅ Login successful. Redirecting...';

        setTimeout(() => {
          window.location.replace('index.html');
        }, 500);

      } catch (err) {
        console.error('Admin login error:', err);
        hideOverlay(loadingOverlay);
        setLoading(loginBtn, false, 'Sign In to Admin Panel');

        if (err.message === 'Admin access only') {
          if (errorEl) errorEl.textContent = '⛔ This account is not an admin.';
        } else if (
          err.code === 'auth/user-not-found' ||
          err.code === 'auth/wrong-password' ||
          err.code === 'auth/invalid-credential'
        ) {
          if (errorEl) errorEl.textContent = 'Invalid email or password.';
        } else if (err.code === 'auth/invalid-email') {
          if (errorEl) errorEl.textContent = 'Invalid email address.';
        } else if (err.code === 'auth/too-many-requests') {
          if (errorEl) errorEl.textContent = 'Too many attempts. Try again later.';
        } else if (err.code === 'auth/network-request-failed') {
          if (errorEl) errorEl.textContent = 'Network error. Check your internet.';
        } else if (err.code === 'auth/user-disabled') {
          if (errorEl) errorEl.textContent = 'Account disabled. Contact support.';
        } else {
          if (errorEl) errorEl.textContent = err.message || 'Login failed. Try again.';
        }
      }
    });
  }

  // Auto-redirect if already logged in as admin
  onAuthStateChanged(auth, (user) => {
    if (user && isAdminEmail(user.email)) {
      window.location.replace('index.html');
    } else if (user && !isAdminEmail(user.email)) {
      signOut(auth);
    }
  });
}

/* ============================================
   ADMIN PAGES — AUTH GUARD
   ============================================ */
if (isAdminPage) {

  console.log('[Auth] Admin page detected');

  onAuthStateChanged(auth, async (user) => {
    console.log('[Auth] State changed:', user ? user.email : 'no user');

    if (!user) {
      console.log('[Auth] No user — redirect to login');
      window.location.replace('login.html');
      return;
    }

    if (!isAdminEmail(user.email)) {
      console.warn('[Auth] Not admin — signing out');
      await signOut(auth);
      window.location.replace('login.html');
      return;
    }

    // Update admin email in navbar
    const adminUserEl = document.getElementById('adminUserEmail');
    if (adminUserEl) {
      const spanEl = adminUserEl.querySelector('span');
      if (spanEl) spanEl.textContent = user.email;
    }

    // Update admin info in settings
    const adminInfoEmail = document.getElementById('adminInfoEmail');
    if (adminInfoEmail) adminInfoEmail.textContent = user.email;

    const adminInfoLastLogin = document.getElementById('adminInfoLastLogin');
    if (adminInfoLastLogin) {
      try {
        const adminSnap = await getDoc(doc(db, 'admins', user.uid));
        if (adminSnap.exists()) {
          const data = adminSnap.data();
          if (data.lastLogin?.toDate) {
            adminInfoLastLogin.textContent = data.lastLogin
              .toDate()
              .toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              });
          } else {
            adminInfoLastLogin.textContent = 'First session';
          }
        } else {
          adminInfoLastLogin.textContent = 'First session';
        }
      } catch (err) {
        adminInfoLastLogin.textContent = '—';
      }
    }

    // Dispatch adminReady event (with retries)
    console.log('[Auth] Dispatching adminReady');
    const fireReady = () => {
      window.dispatchEvent(new CustomEvent('adminReady', {
        detail: { user }
      }));
    };

    fireReady();
    setTimeout(fireReady, 100);
    setTimeout(fireReady, 500);
  });
}

/* ============================================
   HELPERS
   ============================================ */
function setLoading(btn, isLoading, text) {
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    const span = btn.querySelector('span');
    if (span) span.textContent = text || 'Loading...';
  } else {
    btn.disabled = false;
    const span = btn.querySelector('span');
    if (span) span.textContent = text || 'Submit';
  }
}

function showOverlay(el, text) {
  if (!el) return;
  const textEl = el.querySelector('.admin-loading-text');
  if (textEl) textEl.textContent = text || 'Loading...';
  el.classList.remove('hidden');
}

function hideOverlay(el) {
  if (!el) return;
  el.classList.add('hidden');
}

/* ============================================
   IDLE AUTO LOGOUT (30 min)
   ============================================ */
if (isAdminPage) {
  const IDLE_LIMIT = 30 * 60 * 1000;
  let idleTimer;

  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      alert('Session expired due to inactivity. Please login again.');
      try { await signOut(auth); } catch (err) {}
      window.location.replace('login.html');
    }, IDLE_LIMIT);
  };

  ['click', 'keypress', 'mousemove', 'scroll', 'touchstart'].forEach((ev) => {
    document.addEventListener(ev, resetIdle, { passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resetIdle();
  });

  resetIdle();
}
