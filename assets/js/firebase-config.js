import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-analytics.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAlVzZYYWOiFIeqB4i42xwCmwVKe0zt0u8",
  authDomain: "server-monitoring-2d399.firebaseapp.com",
  databaseURL: "https://server-monitoring-2d399-default-rtdb.firebaseio.com",
  projectId: "server-monitoring-2d399",
  storageBucket: "server-monitoring-2d399.firebasestorage.app",
  messagingSenderId: "839149449882",
  appId: "1:839149449882:web:fb78a8c1526662d045e523",
  measurementId: "G-48ZNL32NEE"
};

export const SERVER_ID = "anastudio";
export const ALLOWED_EMAIL = "admin@ana.studio";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

isSupported().then((supported) => {
  if (supported) getAnalytics(app);
}).catch(() => {});
