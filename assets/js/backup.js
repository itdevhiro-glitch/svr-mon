import { ref, onValue, push, set, off } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { db, SERVER_ID } from "./firebase-config.js";
import { $, fmtBytes, fmtDateTime, toast } from "./utils.js";

let listeners = [];
let latestLogText = "";
let latestSnapshot = null;
let currentSearchRequestId = null;

const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c]));
const arr = (v) => Array.isArray(v) ? v : (v && typeof v === "object" ? Object.values(v) : []);

function bind(path, cb) {
  const r = ref(db, path);
  const unsub = onValue(r, cb);
  listeners.push(() => unsub?.());
}

function stateClass(state) {
  const s = String(state || "idle").toLowerCase();
  if (["running","starting"].includes(s)) return "backup-state-running";
  if (["success","completed"].includes(s)) return "backup-state-success";
  if (["failed","error"].includes(s)) return "backup-state-failed";
  return "";
}

function renderStatus(data = {}) {
  const state = String(data.state || "idle").toUpperCase();
  const percent = Math.max(0, Math.min(100, Number(data.percent) || 0));
  $("backupState").textContent = state;
  $("backupState").className = stateClass(data.state);
  $("backupPhase").textContent = data.phase || "Waiting";
  $("backupPercent").textContent = percent.toFixed(percent % 1 ? 1 : 0);
  $("backupProgressBar").style.width = `${percent}%`;
  $("backupSource").textContent = data.source || "—";
  $("backupCurrentFile").textContent = data.currentFile || "—";
  $("backupTransferred").textContent = data.transferredBytes ? fmtBytes(data.transferredBytes) : "—";
  $("backupSpeed").textContent = data.speed || "—";
  $("backupStarted").textContent = data.startedAt ? fmtDateTime(data.startedAt) : "—";
  $("backupUpdated").textContent = data.updatedAt ? fmtDateTime(data.updatedAt) : "—";
  $("backupRunButton").disabled = ["running","starting"].includes(String(data.state || "").toLowerCase());
}

function renderSummary(data = {}) {
  latestSnapshot = data.latestSnapshot || null;
  latestLogText = data.latestLogText || "";
  $("backupRetention").textContent = `${Number(data.retention) || 8} snapshots`;
  $("backupLatestSnapshot").textContent = latestSnapshot || "—";
  $("backupLastResult").textContent = data.lastResult || "—";
  $("backupDownloadLog").disabled = !latestLogText;
}

function renderRecentFiles(value) {
  const files = arr(value).filter(Boolean).slice(-200).reverse();
  $("backupFileCount").textContent = `${files.length} files`;
  $("backupRecentFiles").innerHTML = files.length ? files.map((f) => `
    <tr><td><span class="status-pill">${esc(f.source || "—")}</span></td><td class="backup-path"><strong>${esc(f.path || "—")}</strong></td><td>${fmtBytes(f.size || 0)}</td><td>${f.timestamp ? fmtDateTime(f.timestamp) : "—"}</td></tr>
  `).join("") : '<tr><td colspan="4" class="empty-cell">Belum ada aktivitas backup.</td></tr>';
}

function renderHistory(value) {
  const items = arr(value).filter(Boolean).sort((a,b) => Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,16);
  $("backupHistory").innerHTML = items.length ? items.map((x) => {
    const status = String(x.status || "unknown").toLowerCase();
    return `<tr><td><strong>${esc(x.snapshot || "—")}</strong></td><td><span class="status-pill ${esc(status)}">${esc(status.toUpperCase())}</span></td><td>${Number(x.fileCount || 0).toLocaleString("id-ID")}</td><td>${x.createdAt ? fmtDateTime(x.createdAt) : "—"}</td></tr>`;
  }).join("") : '<tr><td colspan="4" class="empty-cell">Belum ada snapshot.</td></tr>';
}

function renderAudit(value) {
  const items = arr(value).filter(Boolean).sort((a,b) => Number(b.timestamp||0)-Number(a.timestamp||0)).slice(0,50);
  $("backupRecoveryAudit").innerHTML = items.length ? items.map((x) => `<tr><td>${x.timestamp ? fmtDateTime(x.timestamp) : "—"}</td><td class="backup-path"><strong>${esc(x.path || "—")}</strong></td><td>${esc(x.snapshot || "—")}</td><td><span class="status-pill ${esc(String(x.status||"").toLowerCase())}">${esc(String(x.status||"unknown").toUpperCase())}</span></td><td>${esc(x.message || "—")}</td></tr>`).join("") : '<tr><td colspan="5" class="empty-cell">Belum ada recovery.</td></tr>';
}

async function sendRequest(payload) {
  const requestRef = push(ref(db, `servers/${SERVER_ID}/backup/requests`));
  await set(requestRef, { ...payload, status: "pending", createdAt: Date.now() });
  return requestRef.key;
}

async function runBackup() {
  if (!confirm("Jalankan backup manual sekarang? Proses berjalan di server dan tetap aktif walau browser ditutup.")) return;
  try {
    await sendRequest({ type: "runBackup" });
    toast("Backup request dikirim ke server");
  } catch (e) { toast(`Gagal: ${e.message}`); }
}

async function searchBackup() {
  const q = $("backupSearchInput").value.trim();
  if (q.length < 2) { $("backupRecoveryStatus").textContent = "Masukkan minimal 2 karakter."; return; }
  $("backupSearchButton").disabled = true;
  $("backupRecoveryStatus").textContent = `Mencari “${q}” pada snapshot...`;
  $("backupSearchResults").innerHTML = '<tr><td colspan="5" class="empty-cell">Searching…</td></tr>';
  try {
    const id = await sendRequest({ type: "search", query: q });
    currentSearchRequestId = id;
    const r = ref(db, `servers/${SERVER_ID}/backup/requests/${id}`);
    const unsub = onValue(r, (snap) => {
      const data = snap.val();
      if (!data || !["done","failed"].includes(data.status)) return;
      if (data.status === "failed") {
        $("backupRecoveryStatus").textContent = data.message || "Search gagal.";
        $("backupSearchResults").innerHTML = '<tr><td colspan="5" class="empty-cell">Search gagal.</td></tr>';
      } else {
        const results = arr(data.results).filter(Boolean);
        $("backupRecoveryStatus").textContent = `${results.length} file ditemukan.`;
        $("backupSearchResults").innerHTML = results.length ? results.map((f, i) => `<tr><td>${esc(f.snapshot)}</td><td><span class="status-pill">${esc(f.source)}</span></td><td class="backup-path"><strong>${esc(f.path)}</strong></td><td>${fmtBytes(f.size || 0)}</td><td><button class="backup-action restore-button" data-restore-index="${i}">Restore</button></td></tr>`).join("") : '<tr><td colspan="5" class="empty-cell">File tidak ditemukan pada snapshot.</td></tr>';
        $("backupSearchResults").querySelectorAll("[data-restore-index]").forEach((btn) => {
          btn.addEventListener("click", () => restoreFile(results[Number(btn.dataset.restoreIndex)]));
        });
      }
      $("backupSearchButton").disabled = false;
      unsub();
    });
  } catch (e) {
    $("backupSearchButton").disabled = false;
    $("backupRecoveryStatus").textContent = `Gagal: ${e.message}`;
  }
}

async function restoreFile(file) {
  const target = file.source === "gdrive" ? `/mnt/gdrive/${file.path}` : `/srv/aquanova/${file.path}`;
  if (!confirm(`Restore file ini?\n\n${target}\n\nSnapshot: ${file.snapshot}\n\nJika file sudah ada, versi saat ini akan ditimpa.`)) return;
  try {
    await sendRequest({ type: "restore", source: file.source, path: file.path, snapshot: file.snapshot });
    toast("Recovery request dikirim");
    $("backupRecoveryStatus").textContent = `Recovery ${file.path} sedang diproses server…`;
  } catch (e) { toast(`Recovery gagal dikirim: ${e.message}`); }
}

function downloadLog() {
  if (!latestLogText) return;
  const blob = new Blob([latestLogText], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `aquanova-backup-${latestSnapshot || "latest"}.log`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
}

export function initBackupCenter() {
  stopBackupCenter();
  bind(`servers/${SERVER_ID}/backup/status`, (s) => renderStatus(s.val() || {}));
  bind(`servers/${SERVER_ID}/backup/summary`, (s) => renderSummary(s.val() || {}));
  bind(`servers/${SERVER_ID}/backup/recentFiles`, (s) => renderRecentFiles(s.val() || []));
  bind(`servers/${SERVER_ID}/backup/history`, (s) => renderHistory(s.val() || []));
  bind(`servers/${SERVER_ID}/backup/recoveryAudit`, (s) => renderAudit(s.val() || []));
  $("backupRunButton").onclick = runBackup;
  $("backupDownloadLog").onclick = downloadLog;
  $("backupSearchButton").onclick = searchBackup;
  $("backupSearchInput").onkeydown = (e) => { if (e.key === "Enter") searchBackup(); };
}

export function stopBackupCenter() {
  listeners.forEach((fn) => { try { fn(); } catch {} });
  listeners = [];
}
