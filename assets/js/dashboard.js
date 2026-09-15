import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { db, SERVER_ID } from "./firebase-config.js";
import {
  $, clamp, fmtBytes, fmtRate, fmtNumber, fmtUptime, fmtDateTime,
  heartbeatState, getRootStorage, getPrimaryNetwork, healthScore, safeText
} from "./utils.js";

let unsubscribeCurrent = null;
let usageChart = null;
let networkChart = null;
let heartbeatTimer = null;
let lastData = null;

function makeChart(canvas, datasets, max = null) {
  if (!window.Chart) return null;
  return new window.Chart(canvas, {
    type: "line",
    data: { labels: [], datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { labels: { color: "#8397b0", boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { size: 10 } } },
        tooltip: { backgroundColor: "#0c1726", borderColor: "#24384f", borderWidth: 1, titleColor: "#eaf2ff", bodyColor: "#9eb0c6" }
      },
      scales: {
        x: { grid: { color: "rgba(126,156,190,.06)" }, ticks: { color: "#5f748e", maxTicksLimit: 6, font: { size: 9 } } },
        y: { beginAtZero: true, suggestedMax: max, grid: { color: "rgba(126,156,190,.07)" }, ticks: { color: "#5f748e", font: { size: 9 } } }
      }
    }
  });
}

function initCharts() {
  if (usageChart || !window.Chart) return;
  usageChart = makeChart($("usageChart"), [
    { label: "CPU %", data: [], borderColor: "#4bb4ff", backgroundColor: "rgba(75,180,255,.08)", tension: .28, pointRadius: 0, borderWidth: 1.7, fill: true },
    { label: "RAM %", data: [], borderColor: "#7a78ff", backgroundColor: "rgba(122,120,255,.05)", tension: .28, pointRadius: 0, borderWidth: 1.7, fill: true }
  ], 100);
  networkChart = makeChart($("networkChart"), [
    { label: "RX KB/s", data: [], borderColor: "#52e6dd", tension: .25, pointRadius: 0, borderWidth: 1.6 },
    { label: "TX KB/s", data: [], borderColor: "#f3c96b", tension: .25, pointRadius: 0, borderWidth: 1.6 }
  ]);
}

function pushChart(chart, label, values, maxPoints = 72) {
  if (!chart) return;
  chart.data.labels.push(label);
  values.forEach((value, i) => chart.data.datasets[i].data.push(Number(value) || 0));
  if (chart.data.labels.length > maxPoints) {
    chart.data.labels.shift();
    chart.data.datasets.forEach((d) => d.data.shift());
  }
  chart.update("none");
}

function setProgress(id, value) {
  const el = $(id);
  if (el) el.style.width = `${clamp(value)}%`;
}

function renderStatus(data) {
  const hs = heartbeatState(data?.heartbeat || data?.timestamp);
  const badge = $("serverStateBadge");
  badge.textContent = hs.label;
  badge.className = `state-badge ${hs.state}`;
  $("sideStatus").textContent = hs.label;
  $("sideStatusDot").className = `dot ${hs.state}`;
  $("sideHeartbeat").textContent = hs.state === "offline" ? "Heartbeat stale" : "Heartbeat active";
  return hs;
}

function renderOverview(data) {
  lastData = data;
  const hs = renderStatus(data);
  const cpu = Number(data?.cpu?.usage) || 0;
  const ram = Number(data?.memory?.usage) || 0;
  const root = getRootStorage(data?.storage || []);
  const disk = Number(root?.usage) || 0;
  const net = getPrimaryNetwork(data?.network?.traffic || data?.network || []);
  const temp = data?.cpu?.temperature;
  const score = hs.state === "offline" ? 0 : healthScore(data);

  $("serverName").textContent = safeText(data?.serverName, "ANASTUDIO");
  $("pageTitle").textContent = `${safeText(data?.serverName, "ANASTUDIO")} Control Center`;
  $("serverOs").textContent = [data?.system?.distro, data?.system?.release].filter(Boolean).join(" ") || "Linux Server";
  $("hostname").textContent = safeText(data?.system?.hostname);
  $("uptime").textContent = fmtUptime(data?.system?.uptime);
  $("heartbeat").textContent = fmtDateTime(data?.heartbeat || data?.timestamp);
  $("kernel").textContent = safeText(data?.system?.kernel);
  $("lastSync").textContent = `Synced ${new Date().toLocaleTimeString("id-ID")}`;

  $("healthScore").textContent = score;
  $("healthRing").style.setProperty("--score", `${score * 3.6}deg`);
  $("healthText").textContent = score >= 90 ? "Infrastructure healthy" : score >= 70 ? "Attention recommended" : "Resource pressure detected";

  $("cpuUsage").textContent = fmtNumber(cpu, 1); setProgress("cpuBar", cpu);
  $("cpuSub").textContent = `${safeText(data?.cpu?.manufacturer, "CPU")} ${safeText(data?.cpu?.brand, "")}`.trim();
  $("ramUsage").textContent = fmtNumber(ram, 1); setProgress("ramBar", ram);
  $("ramSub").textContent = `${fmtBytes(data?.memory?.used)} / ${fmtBytes(data?.memory?.total)}`;
  $("diskUsage").textContent = fmtNumber(disk, 1); setProgress("diskBar", disk);
  $("diskSub").textContent = root ? `${root.mount} · ${fmtBytes(root.used)} / ${fmtBytes(root.total)}` : "No filesystem data";
  $("cpuTemp").textContent = Number.isFinite(Number(temp)) ? fmtNumber(temp, 0) : "—"; setProgress("tempBar", Number(temp) || 0);
  $("processTotal").textContent = safeText(data?.processes?.total);
  $("processRunning").textContent = safeText(data?.processes?.running);
  $("networkRx").textContent = fmtRate(net?.rxSpeed || 0);
  $("networkTx").textContent = fmtRate(net?.txSpeed || 0);
  $("networkIface").textContent = `Interface ${safeText(net?.interface)}`;

  const load = data?.loadAverage || data?.load || {};
  const l1 = Number(load.oneMinute ?? load.one ?? 0);
  const l5 = Number(load.fiveMinutes ?? load.five ?? 0);
  const l15 = Number(load.fifteenMinutes ?? load.fifteen ?? 0);
  const logical = Number(data?.cpu?.logicalCores || data?.cpu?.cores?.length || 2) || 2;
  $("load1").textContent = fmtNumber(l1); $("load5").textContent = fmtNumber(l5); $("load15").textContent = fmtNumber(l15);
  $("load1Bar").style.width = `${clamp(l1 / logical * 100)}%`;
  $("load5Bar").style.width = `${clamp(l5 / logical * 100)}%`;
  $("load15Bar").style.width = `${clamp(l15 / logical * 100)}%`;

  renderServices(data?.services || {});
  renderCompute(data);
  renderStorage(data?.storage || []);
  renderStorageManagement(data?.storageManagement || null);
  renderStorageAccess(data?.storageAccess || null, data?.storageManagement || null);
  renderNetwork(data?.network?.traffic || data?.network || []);
  renderProcesses(data?.processes || {});

  initCharts();
  const chartTime = new Date(data?.timestamp || Date.now()).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  pushChart(usageChart, chartTime, [cpu, ram]);
  pushChart(networkChart, chartTime, [(Number(net?.rxSpeed) || 0) / 1024, (Number(net?.txSpeed) || 0) / 1024]);

  const alerts = [];
  if (ram >= 90) alerts.push(`RAM critical ${ram.toFixed(1)}%`);
  if (cpu >= 90) alerts.push(`CPU critical ${cpu.toFixed(1)}%`);
  if (disk >= 90) alerts.push(`Disk critical ${disk.toFixed(1)}%`);
  if (hs.state !== "online") alerts.push(`Server ${hs.label.toLowerCase()}`);
  const alert = $("globalAlert");
  if (alerts.length) { alert.textContent = `⚠ ${alerts.join(" · ")}`; alert.classList.remove("hidden"); }
  else alert.classList.add("hidden");
}

function renderServices(services) {
  const items = services?.items && typeof services.items === "object" ? services.items : {};
  const entries = Object.entries(items);
  const monitored = Number.isFinite(Number(services?.monitored)) ? Number(services.monitored) : entries.length;
  const healthy = Number.isFinite(Number(services?.healthy)) ? Number(services.healthy) : entries.filter(([, state]) => state?.healthy === true).length;
  const unhealthy = Number.isFinite(Number(services?.unhealthy)) ? Number(services.unhealthy) : Math.max(0, monitored - healthy);

  $("serviceCount").textContent = `${monitored} monitored · ${healthy} healthy · ${unhealthy} issues`;

  if (!entries.length) {
    $("serviceGrid").innerHTML = '<div class="empty-state">Service metrics belum tersedia pada collector.</div>';
    return;
  }

  $("serviceGrid").innerHTML = entries.map(([key, state]) => {
    const ok = state?.healthy === true;
    const label = safeText(state?.label, key);
    const detail = [state?.activeState, state?.subState].filter(Boolean).join(" / ") || "unknown";
    return `<div class="service-item"><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></span><b class="service-pill ${ok ? "" : "offline"}">${ok ? "HEALTHY" : "UNHEALTHY"}</b></div>`;
  }).join("");
}
function renderCompute(data) {
  const cpu = data?.cpu || {};
  const mem = data?.memory || {};
  $("cpuModel").textContent = `${safeText(cpu.manufacturer, "")} ${safeText(cpu.brand, "CPU")}`.trim();
  $("cpuCores").textContent = `${safeText(cpu.physicalCores, "—")} physical / ${safeText(cpu.logicalCores ?? cpu.cores?.length, "—")} logical cores`;
  $("cpuFrequency").textContent = cpu.frequency ? `${fmtNumber(cpu.frequency, 2)} GHz` : "—";
  $("memoryTotal").textContent = fmtBytes(mem.total);
  $("memoryAvailable").textContent = `${fmtBytes(mem.available)} available`;
  $("swapUsed").textContent = fmtBytes(mem.swapUsed ?? mem.swapused);
  $("swapTotal").textContent = `${fmtBytes(mem.swapTotal ?? mem.swaptotal)} total`;

  const cores = Array.isArray(cpu.cores) ? cpu.cores : [];
  $("coreGrid").innerHTML = cores.length ? cores.map((c, i) => `<div class="core-card"><div><span>CORE ${c.core ?? i}</span><strong>${fmtNumber(c.usage, 1)}%</strong></div><i><b style="width:${clamp(c.usage)}%"></b></i></div>`).join("") : '<div class="empty-state">Per-core metrics belum tersedia pada collector.</div>';
}

function renderStorage(storage) {
  const body = $("storageTable");
  if (!Array.isArray(storage) || !storage.length) { body.innerHTML = '<tr><td colspan="6" class="empty-cell">Waiting for storage metrics.</td></tr>'; return; }
  body.innerHTML = storage.map((d) => `<tr><td>${escapeHtml(safeText(d.filesystem))}</td><td><strong>${escapeHtml(safeText(d.mount))}</strong></td><td>${fmtBytes(d.total)}</td><td>${fmtBytes(d.used)}</td><td>${fmtBytes(d.available)}</td><td><div class="usage-cell"><span>${fmtNumber(d.usage, 1)}%</span><div class="mini-bar"><i style="width:${clamp(d.usage)}%"></i></div></div></td></tr>`).join("");
}


function renderStorageManagement(storageManagement) {
  const list = $("managedPathList");
  const state = $("storageManagementState");
  if (!list) return;

  if (!storageManagement || storageManagement.available !== true) {
    if (state) state.textContent = "BACKEND UNAVAILABLE";
    list.innerHTML = '<div class="empty-state large-empty"><b>Storage discovery belum tersedia.</b><span>Menunggu data aktual ANASTUDIO dari /servers/anastudio/current/storageManagement.</span></div>';
    return;
  }

  const paths = storageManagement.paths && typeof storageManagement.paths === "object" ? storageManagement.paths : {};
  const entries = Object.entries(paths).sort(([a],[b]) => a.localeCompare(b));
  const count = Number.isFinite(Number(storageManagement.count)) ? Number(storageManagement.count) : entries.length;
  if (state) state.textContent = `LIVE · ${count} PATHS`;

  const fsInfo = storageManagement.filesystem || {};
  const samba = storageManagement.samba || {};
  const root = safeText(storageManagement.root, "—");
  const meta = [
    root,
    [fsInfo.source, fsInfo.type].filter(Boolean).join(" · "),
    storageManagement.aclAvailable ? "ACL available" : "ACL unavailable",
    samba.available && samba.share ? `SMB ${samba.share}` : "SMB not mapped"
  ].filter(Boolean).map(escapeHtml).join(" · ");

  if (!entries.length) {
    list.innerHTML = `<div class="empty-state large-empty"><b>0 managed paths discovered.</b><span>${meta}</span></div>`;
    return;
  }

  list.innerHTML = `<div class="storage-live-meta">${meta}</div>` + entries.map(([key, item]) => {
    const name = safeText(item?.name, key);
    const path = safeText(item?.path, "—");
    const identity = `${safeText(item?.owner, "—")}:${safeText(item?.group, "—")}`;
    const mode = safeText(item?.mode, "—");
    const used = item?.usedBytes == null ? "—" : fmtBytes(item.usedBytes);
    return `<div class="managed-path">
      <div class="path-main"><div class="path-icon">▰</div><div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(path)}</small></div></div>
      <div class="path-policy"><b>LIVE SERVER PATH</b><span>${escapeHtml(identity)} · mode ${escapeHtml(mode)}</span></div>
      <div class="path-usage"><strong>${escapeHtml(used)}</strong><small>Used</small></div>
    </div>`;
  }).join("");
}


function renderStorageAccess(storageAccess, storageManagement) {
  const state = $("accessState");
  const summary = $("accessSummary");
  const list = $("accessUserList");
  const smbState = $("smbState");
  const smbInfo = $("smbBackendInfo");
  const pathSelect = $("smbPathSelect");
  if (!list) return;

  if (!storageAccess || storageAccess.available !== true) {
    if (state) state.textContent = "BACKEND UNAVAILABLE";
    if (smbState) smbState.textContent = "WAITING";
    if (summary) summary.innerHTML = "";
    list.innerHTML = '<div class="empty-state"><b>Access discovery belum tersedia.</b><span>Menunggu current/storageAccess dari ANASTUDIO.</span></div>';
    return;
  }

  const users = storageAccess.users && typeof storageAccess.users === "object" ? storageAccess.users : {};
  const groups = storageAccess.groups && typeof storageAccess.groups === "object" ? storageAccess.groups : {};
  const paths = storageAccess.paths && typeof storageAccess.paths === "object" ? storageAccess.paths : {};
  const userEntries = Object.entries(users).sort(([a],[b]) => a.localeCompare(b));
  const sambaCount = userEntries.filter(([,u]) => u?.sambaAccount === true).length;
  const interactiveCount = userEntries.filter(([,u]) => u?.interactiveShell === true).length;
  if (state) state.textContent = `LIVE · ${userEntries.length} USERS`;
  if (summary) summary.innerHTML = `
    <div><span>LINUX USERS</span><strong>${userEntries.length}</strong></div>
    <div><span>SAMBA</span><strong>${sambaCount}</strong></div>
    <div><span>GROUPS</span><strong>${Object.keys(groups).length}</strong></div>
    <div><span>PATHS</span><strong>${Object.keys(paths).length}</strong></div>`;

  list.innerHTML = userEntries.map(([name,u]) => {
    const gs = Array.isArray(u?.groups) ? u.groups : [];
    const chips = gs.slice(0,6).map(g => `<span>${escapeHtml(g)}</span>`).join("") + (gs.length > 6 ? `<span>+${gs.length-6}</span>` : "");
    return `<div class="access-user-card">
      <div class="access-user-head"><div class="user-avatar-mini">${escapeHtml(name.slice(0,1).toUpperCase())}</div><div><strong>${escapeHtml(name)}</strong><small>UID ${escapeHtml(safeText(u?.uid))} · ${escapeHtml(safeText(u?.shell))}</small></div></div>
      <div class="identity-badges"><span class="ok">LINUX</span><span class="${u?.sambaAccount ? "ok" : "muted"}">SMB ${u?.sambaAccount ? "ON" : "OFF"}</span><span class="${u?.interactiveShell ? "warn" : "muted"}">${u?.interactiveShell ? "SHELL" : "NOLOGIN"}</span></div>
      <div class="group-chips">${chips || '<span>no groups</span>'}</div>
    </div>`;
  }).join("") || '<div class="empty-state">No local users discovered.</div>';

  const samba = storageManagement?.samba || {};
  if (smbState) smbState.textContent = samba?.available ? `LIVE · ${safeText(samba.share, "SMB")}` : "SMB NOT MAPPED";
  if (smbInfo) smbInfo.innerHTML = `<div><span>SHARE</span><strong>${escapeHtml(safeText(samba?.share, "—"))}</strong></div><div><span>ROOT</span><strong>${escapeHtml(safeText(samba?.root, storageManagement?.root || "—"))}</strong></div><div><span>SMB USERS</span><strong>${sambaCount}</strong></div>`;
  if (pathSelect) {
    const pathEntries = Object.entries(paths).sort(([a],[b]) => a.localeCompare(b));
    pathSelect.innerHTML = pathEntries.map(([key,p]) => `<option value="${escapeHtml(key)}">${escapeHtml(safeText(p?.name,key))} · ${escapeHtml(safeText(p?.group,"—"))}</option>`).join("") || '<option>No paths</option>';
    pathSelect.disabled = true;
  }
  const hint = $("smbHint");
  if (hint) hint.textContent = "Backend identity + Samba discovery live. Effective RW/RO/DENY mapping is the next backend stage; generator stays locked until then.";
}

function renderNetwork(network) {
  const body = $("networkTable");
  if (!Array.isArray(network) || !network.length) { body.innerHTML = '<tr><td colspan="7" class="empty-cell">Waiting for network metrics.</td></tr>'; return; }
  body.innerHTML = network.map((n) => `<tr><td><strong>${escapeHtml(safeText(n.interface))}</strong></td><td>${fmtBytes(n.rxBytes)}</td><td>${fmtBytes(n.txBytes)}</td><td>${fmtRate(n.rxSpeed)}</td><td>${fmtRate(n.txSpeed)}</td><td>${Number(n.rxErrors || 0) + Number(n.txErrors || 0)}</td><td>${Number(n.rxDropped || 0) + Number(n.txDropped || 0)}</td></tr>`).join("");
}

function renderProcesses(proc) {
  $("procTotal2").textContent = safeText(proc.total);
  $("procRunning2").textContent = safeText(proc.running);
  $("procSleeping2").textContent = safeText(proc.sleeping);
  $("procBlocked2").textContent = safeText(proc.blocked);
  const top = proc.topCpu || [];
  $("processTable").innerHTML = top.length ? top.map((p) => `<tr><td>${safeText(p.pid)}</td><td><strong>${escapeHtml(safeText(p.name))}</strong></td><td>${fmtNumber(p.cpu, 2)}%</td><td>${fmtNumber(p.memory, 2)}%</td><td>${escapeHtml(safeText(p.state))}</td></tr>`).join("") : '<tr><td colspan="5" class="empty-cell">Top-process metrics belum tersedia pada collector.</td></tr>';
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

export function startDashboard() {
  if (unsubscribeCurrent) unsubscribeCurrent();
  const currentRef = ref(db, `servers/${SERVER_ID}/current`);
  unsubscribeCurrent = onValue(currentRef, (snapshot) => {
    if (!snapshot.exists()) {
      $("globalAlert").textContent = "Belum ada telemetry di Firebase: servers/anastudio/current";
      $("globalAlert").classList.remove("hidden");
      return;
    }
    renderOverview(snapshot.val());
  }, (error) => {
    $("globalAlert").textContent = `Firebase read error: ${error.message}`;
    $("globalAlert").classList.remove("hidden");
  });
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => { if (lastData) renderStatus(lastData); }, 5000);
}

export function stopDashboard() {
  if (unsubscribeCurrent) unsubscribeCurrent();
  unsubscribeCurrent = null;
  clearInterval(heartbeatTimer);
}
