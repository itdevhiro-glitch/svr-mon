import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { auth, ALLOWED_EMAIL } from "./firebase-config.js";
import { $, toast } from "./utils.js";

export function initAuth(onReady, onLogout) {
  const form = $("loginForm");
  const button = $("loginButton");
  const error = $("loginError");

  $("togglePassword").addEventListener("click", () => {
    const input = $("password");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    $("togglePassword").textContent = show ? "HIDE" : "SHOW";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const email = $("email").value.trim().toLowerCase();
    const password = $("password").value;

    if (email !== ALLOWED_EMAIL) {
      error.textContent = "Email ini tidak diizinkan mengakses dashboard.";
      return;
    }

    button.disabled = true;
    button.querySelector("span").textContent = "Authenticating...";
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      if ((credential.user.email || "").toLowerCase() !== ALLOWED_EMAIL) {
        await signOut(auth);
        throw new Error("Unauthorized account");
      }
      toast("Login berhasil");
    } catch (e) {
      const code = e?.code || "";
      error.textContent = code.includes("invalid-credential")
        ? "Email atau password salah."
        : code.includes("too-many-requests")
          ? "Terlalu banyak percobaan. Coba lagi nanti."
          : "Login gagal. Pastikan akun Firebase Auth sudah dibuat.";
    } finally {
      button.disabled = false;
      button.querySelector("span").textContent = "Authenticate";
    }
  });

  $("logoutButton").addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, async (user) => {
    if (user && (user.email || "").toLowerCase() === ALLOWED_EMAIL) {
      $("loginView").classList.add("hidden");
      $("appView").classList.remove("hidden");
      onReady?.(user);
      return;
    }

    if (user) await signOut(auth);
    $("appView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
    onLogout?.();
  });
}
