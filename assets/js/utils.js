export const $ = (id) => document.getElementById(id);

export function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function fmtBytes(bytes, decimals = 1) {
  const n = Number(bytes) || 0;
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(Math.abs(n)) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

export function fmtRate(bytesPerSecond) {
  return `${fmtBytes(bytesPerSecond, 1)}/s`;
}

export function fmtNumber(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

export function fmtUptime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function fmtDateTime(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Jakarta"
  }).format(new Date(n));
}

export function fmtClock(ms = Date.now()) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeStyle: "medium",
    timeZone: "Asia/Jakarta"
  }).format(new Date(ms));
}

export function heartbeatState(timestamp) {
  const age = Date.now() - Number(timestamp || 0);
  if (!timestamp || age > 60000) return { state: "offline", label: "OFFLINE", age };
  if (age > 15000) return { state: "warning", label: "UNREACHABLE", age };
  return { state: "online", label: "ONLINE", age };
}

export function getRootStorage(storage = []) {
  if (!Array.isArray(storage) || !storage.length) return null;
  return storage.find((x) => x.mount === "/") || storage[0];
}

export function getPrimaryNetwork(network = []) {
  if (!Array.isArray(network) || !network.length) return null;
  return network.find((x) => x.interface === "eth0") ||
    network.find((x) => x.interface === "enp0s0") ||
    network.find((x) => !String(x.interface || "").startsWith("lo")) || network[0];
}

export function healthScore(data) {
  const cpu = clamp(data?.cpu?.usage);
  const ram = clamp(data?.memory?.usage);
  const disk = clamp(getRootStorage(data?.storage)?.usage);
  const temp = Number(data?.cpu?.temperature);
  let score = 100;
  score -= Math.max(0, cpu - 55) * 0.35;
  score -= Math.max(0, ram - 65) * 0.45;
  score -= Math.max(0, disk - 75) * 0.55;
  if (Number.isFinite(temp)) score -= Math.max(0, temp - 60) * 0.6;
  return Math.round(clamp(score));
}

export function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

export function safeText(value, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}
