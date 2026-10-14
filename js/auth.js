/* ============================================
   SUPER REWARDS ADMIN — AUTHENTICATION
   Admin login + auth guard for all pages
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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ============================================
   DETECT PAGE TYPE
   ============================================ */
const path = window.location.pathname;
const currentFile = path.split('/').pop() || 'index.html';

const isLoginPage = currentFile === 'login.html' || currentFile === '';
const isAdminPage = !isLoginPage;

/* ============================================
   PASSWORD SHOW/HIDE TOGGLE
   (Applies to login page)
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

  /* --------------------------------------
     HANDLE LOGIN SUBMIT
     -------------------------------------- */
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Reset messages
      if (errorEl) errorEl.textContent = '';
      if (successEl) successEl.textContent = '';

      const email = (emailInput?.value || '').trim().toLowerCase();
      const password = passwordInput?.value || '';

      /* --------------------------------------
         VALIDATIONS
         -------------------------------------- */
      if (!email || !password) {
        if (errorEl) errorEl.textContent = 'Please fill all fields.';
        return;
      }

      // Check email whitelist
      if (!isAdminEmail(email)) {
        if (errorEl) {
          errorEl.textContent = '⛔ Access denied. Not an admin account.';
        }
        return;
      }

      /* --------------------------------------
         ATTEMPT LOGIN
         -------------------------------------- */
      setLoading(loginBtn, true, 'Signing in...');
      showOverlay(loadingOverlay, 'Verifying credentials...');

      try {
        // 1. Firebase Auth sign in
        const cred = await signInWithEmailAndPassword(auth, email, password);

        // 2. Double-check admin whitelist
        if (!isAdminEmail(cred.user.email)) {
          await signOut(auth);
          throw new Error('Admin access only');
        }

        // 3. Update admin document (log last login)
        try {
          const adminRef = doc(db, 'admins', cred.user.uid);
          const adminSnap = await getDoc(adminRef);

          if (adminSnap.exists()) {
            await updateDoc(adminRef, {
              lastLogin: serverTimestamp()
            });
          } else {
            // Create admin doc if doesn't exist (first login)
            const { setDoc } = await import(
              "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
            );
            await setDoc(adminRef, {
              email: cred.user.email,
              createdAt: serverTimestamp(),
              lastLogin: serverTimestamp()
            });
          }
        } catch (logErr) {
          // Don't block login if logging fails
          console.warn('Admin log update failed:', logErr);
        }

        // 4. Success → redirect
        if (successEl) successEl.textContent = '✅ Login successful. Redirecting...';

        setTimeout(() => {
          window.location.href = 'index.html';
        }, 500);

      } catch (err) {
        console.error('Admin login error:', err);
        hideOverlay(loadingOverlay);
        setLoading(loginBtn, false, 'Sign In to Admin Panel');

        /* --------------------------------------
           FRIENDLY ERROR MESSAGES
           -------------------------------------- */
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

  /* --------------------------------------
     AUTO REDIRECT IF ALREADY LOGGED IN
     -------------------------------------- */
  onAuthStateChanged(auth, (user) => {
    if (user && isAdminEmail(user.email)) {
      window.location.href = 'index.html';
    } else if (user && !isAdminEmail(user.email)) {
      // Logged in but not admin — sign out
      signOut(auth);
    }
  });
}

/* ============================================
   ADMIN PAGES — AUTH GUARD
   ============================================ */
if (isAdminPage) {

  /* --------------------------------------
     SETUP LOGOUT BUTTON
     -------------------------------------- */
  const logoutBtn = document.getElementById('adminLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await signOut(auth);
        window.location.href = 'login.html';
      } catch (err) {
        console.error('Logout error:', err);
        alert('Logout failed. Please try again.');
      }
    });
  }

  /* --------------------------------------
     AUTH GUARD
     -------------------------------------- */
  onAuthStateChanged(auth, async (user) => {
    // 1. No user → redirect to login
    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    // 2. Not admin → sign out + redirect
    if (!isAdminEmail(user.email)) {
      await signOut(auth);
      window.location.href = 'login.html';
      return;
    }

    // 3. Update admin email display in navbar
    const adminUserEl = document.getElementById('adminUserEmail');
    if (adminUserEl) {
      const spanEl = adminUserEl.querySelector('span');
      if (spanEl) {
        spanEl.textContent = user.email;
      }
    }

    // 4. Update admin info in settings page (if present)
    const adminInfoEmail = document.getElementById('adminInfoEmail');
    if (adminInfoEmail) {
      adminInfoEmail.textContent = user.email;
    }

    // 5. Update last login in settings page
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
        console.warn('Could not load last login:', err);
        adminInfoLastLogin.textContent = '—';
      }
    }

    // 6. Dispatch custom event for page-specific scripts
    //    (dashboard.js, users.js etc. will listen)
    window.dispatchEvent(new CustomEvent('adminReady', {
      detail: { user }
    }));
  });
}

/* ============================================
   HELPERS
   ============================================ */

function setLoading(btn, isLoading, text) {
  if (!btn) return;

  if (isLoading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.querySelector('span')?.textContent || '';
    const span = btn.querySelector('span');
    if (span) span.textContent = text || 'Loading...';
  } else {
    btn.disabled = false;
    const span = btn.querySelector('span');
    if (span) {
      span.textContent = text || btn.dataset.originalText || 'Submit';
    }
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
  const IDLE_LIMIT = 30 * 60 * 1000; // 30 minutes
  let idleTimer;

  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      alert('Session expired due to inactivity. Please login again.');
      try {
        await signOut(auth);
      } catch (err) {}
      window.location.href = 'login.html';
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
