/* ============================================
   SUPER REWARDS ADMIN — FIREBASE CONFIG
   Same project as user panel
   ============================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ============================================
   FIREBASE CONFIGURATION
   ⚠️ Same project as user panel (sm-studio-7)
   ============================================ */
const firebaseConfig = {
  apiKey: "AIzaSyCpfrluxsBhnz48ve9RykIy1IxzbBfk7dA",
  authDomain: "sm-studio-7.firebaseapp.com",
  projectId: "sm-studio-7",
  storageBucket: "sm-studio-7.firebasestorage.app",
  messagingSenderId: "126291501472",
  appId: "1:126291501472:web:6e40f955f4db8d107204c5"
};

/* ============================================
   INITIALIZE FIREBASE
   ============================================ */
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Keep admin logged in
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error('Persistence error:', err);
});

/* ============================================
   ADMIN WHITELIST
   ⚠️ Only these emails can access admin panel
   Must match Firestore Rules
   ============================================ */
export const ADMIN_EMAILS = [
  "sapneswarmajhi45@gmail.com"
];

/* ============================================
   COIN SYSTEM CONSTANTS
   (Same as user panel — for consistency)
   ============================================ */
export const COINS_PER_RUPEE = 100;        // 100 coins = ₹1
export const MIN_WITHDRAW_COINS = 1000;    // 1000 coins = ₹10

// Coin → INR conversion
export const COIN_TO_INR = (coins) => {
  const num = Number(coins) || 0;
  return (num / 100).toFixed(2);
};

// INR → Coins conversion
export const INR_TO_COIN = (rupees) => {
  const num = Number(rupees) || 0;
  return Math.floor(num * 100);
};

/* ============================================
   WITHDRAWAL METHODS
   ============================================ */
export const WITHDRAW_METHODS = {
  upi: { label: 'UPI', icon: '💳', minCoins: 1000 },
  googleplay: { label: 'Google Play', icon: '🎮', minCoins: 1000 },
  amazon: { label: 'Amazon', icon: '🛒', minCoins: 1000 }
};

/* ============================================
   ADMIN HELPERS
   ============================================ */

// Check if email is whitelisted admin
export const isAdminEmail = (email) => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
};

// Format date for admin display
export const formatDate = (timestamp) => {
  if (!timestamp) return '—';

  try {
    const date = typeof timestamp.toDate === 'function'
      ? timestamp.toDate()
      : new Date(timestamp);

    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch (err) {
    return '—';
  }
};

// Format date + time
export const formatDateTime = (timestamp) => {
  if (!timestamp) return '—';

  try {
    const date = typeof timestamp.toDate === 'function'
      ? timestamp.toDate()
      : new Date(timestamp);

    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (err) {
    return '—';
  }
};

// Get initial letter for avatar
export const getInitial = (name) => {
  if (!name) return 'U';
  return String(name).trim().charAt(0).toUpperCase() || 'U';
};

// Truncate text safely
export const truncate = (str, max = 30) => {
  if (!str) return '';
  const s = String(str);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
};
