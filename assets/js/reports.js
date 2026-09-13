import { ref, query, orderByChild, startAt, endAt, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { db, SERVER_ID } from "./firebase-config.js";
import { $, fmtBytes, getRootStorage, getPrimaryNetwork, toast } from "./utils.js";

const periods = {
  daily: { label: "Daily", days: 1 },
  weekly: { label: "Weekly", days: 7 },
  monthly: { label: "Monthly", days: 30 }
};

function flattenHistory(obj) {
  return Object.values(obj || {}).filter((x) => x && x.timestamp).sort((a, b) => a.timestamp - b.timestamp);
}

function avg(rows, getter) {
  const values = rows.map(getter).map(Number).filter(Number.isFinite);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
function max(rows, getter) {
  const values = rows.map(getter).map(Number).filter(Number.isFinite);
  return values.length ? Math.max(...values) : 0;
}
function min(rows, getter) {
  const values = rows.map(getter).map(Number).filter(Number.isFinite);
  return values.length ? Math.min(...values) : 0;
}

function styleHeader(row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF163A5F" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF2F6FA3" } } };
  });
}

function addTitle(ws, title, subtitle) {
  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 20, color: { argb: "FF163A5F" } };
  ws.getCell("A1").alignment = { vertical: "middle" };
  ws.getRow(1).height = 32;
  ws.mergeCells("A2:H2");
  ws.getCell("A2").value = subtitle;
  ws.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF66788A" } };
  ws.getRow(2).height = 20;
}

async function buildWorkbook(period, rows, current) {
  if (!window.ExcelJS) throw new Error("ExcelJS belum selesai dimuat. Refresh lalu coba lagi.");
  const wb = new window.ExcelJS.Workbook();
  wb.creator = "Aqua Nova Studio";
  wb.company = "Aqua Nova Studio";
  wb.subject = `${period.label} Infrastructure Monitoring Report`;
  wb.created = new Date();

  const summary = wb.addWorksheet("Executive Summary", { views: [{ showGridLines: false }] });
  summary.properties.defaultRowHeight = 18;
  addTitle(summary, "AQUA NOVA STUDIO — INFRASTRUCTURE REPORT", `${period.label} monitoring report · ANASTUDIO · Generated ${new Date().toLocaleString("id-ID")}`);

  summary.getCell("A4").value = "REPORT INFORMATION";
  summary.getCell("A4").font = { bold: true, color: { argb: "FF4BB4FF" }, size: 10 };
  const info = [
    ["Server", current?.serverName || SERVER_ID],
    ["Hostname", current?.system?.hostname || "—"],
    ["Period", `${period.days} day(s)`],
    ["Samples", rows.length],
    ["Generated", new Date().toLocaleString("id-ID")],
    ["Operating System", `${current?.system?.distro || ""} ${current?.system?.release || ""}`.trim() || "—"]
  ];
  info.forEach((r, i) => { summary.getCell(`A${5+i}`).value = r[0]; summary.getCell(`B${5+i}`).value = r[1]; summary.getCell(`A${5+i}`).font = { bold: true, color: { argb: "FF52677C" } }; });

  summary.getCell("D4").value = "KEY PERFORMANCE INDICATORS";
  summary.getCell("D4").font = { bold: true, color: { argb: "FF4BB4FF" }, size: 10 };
  const rootCurrent = getRootStorage(current?.storage || []);
  const kpis = [
    ["Avg CPU", avg(rows, r => r.cpu?.usage), "%"],
    ["Peak CPU", max(rows, r => r.cpu?.usage), "%"],
    ["Avg Memory", avg(rows, r => r.memory?.usage), "%"],
    ["Peak Memory", max(rows, r => r.memory?.usage), "%"],
    ["CPU Temp Max", max(rows, r => r.cpu?.temperature), "°C"],
    ["Current Disk", Number(rootCurrent?.usage || 0), "%"]
  ];
  kpis.forEach((r, i) => {
    summary.getCell(`D${5+i}`).value = r[0];
    summary.getCell(`E${5+i}`).value = `${Number(r[1] || 0).toFixed(2)} ${r[2]}`;
    summary.getCell(`D${5+i}`).font = { bold: true, color: { argb: "FF52677C" } };
    summary.getCell(`E${5+i}`).font = { bold: true, color: { argb: Number(r[1]) >= 90 ? "FFFF5D73" : "FF163A5F" } };
  });

  summary.getCell("A13").value = "CAPACITY SNAPSHOT";
  summary.getCell("A13").font = { bold: true, color: { argb: "FF4BB4FF" }, size: 10 };
  const capacityRows = [
    ["Memory Total", fmtBytes(current?.memory?.total)],
    ["Memory Used", fmtBytes(current?.memory?.used)],
    ["Root Storage Total", fmtBytes(rootCurrent?.total)],
    ["Root Storage Used", fmtBytes(rootCurrent?.used)],
    ["Process Count", current?.processes?.total ?? "—"],
    ["Uptime Seconds", current?.system?.uptime ?? "—"]
  ];
  capacityRows.forEach((r, i) => { summary.getCell(`A${14+i}`).value = r[0]; summary.getCell(`B${14+i}`).value = r[1]; summary.getCell(`A${14+i}`).font = { bold: true, color: { argb: "FF52677C" } }; });
  summary.columns = [{ width: 25 }, { width: 28 }, { width: 4 }, { width: 25 }, { width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }];
  summary.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  summary.headerFooter.oddFooter = "&LAqua Nova Studio&CInfrastructure Monitoring&RPage &P of &N";

  const telemetry = wb.addWorksheet("Telemetry", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
  telemetry.columns = [
    { header: "Timestamp", key: "timestamp", width: 23 },
    { header: "CPU %", key: "cpu", width: 12 },
    { header: "CPU User %", key: "cpuUser", width: 12 },
    { header: "CPU System %", key: "cpuSystem", width: 14 },
    { header: "CPU Temp °C", key: "temp", width: 14 },
    { header: "Memory %", key: "memory", width: 13 },
    { header: "Memory Used", key: "memoryUsed", width: 16 },
    { header: "Load 1m", key: "load1", width: 12 },
    { header: "Load 5m", key: "load5", width: 12 },
    { header: "Load 15m", key: "load15", width: 12 },
    { header: "Processes", key: "processes", width: 12 },
    { header: "Running", key: "running", width: 11 },
    { header: "RX KB/s", key: "rx", width: 13 },
    { header: "TX KB/s", key: "tx", width: 13 },
    { header: "Root Disk %", key: "disk", width: 13 }
  ];
  styleHeader(telemetry.getRow(1));
  rows.forEach((r) => {
    const net = getPrimaryNetwork(r.network || []);
    const disk = getRootStorage(r.storage || []);
    telemetry.addRow({
      timestamp: new Date(Number(r.timestamp)),
      cpu: Number(r.cpu?.usage || 0), cpuUser: Number(r.cpu?.user || 0), cpuSystem: Number(r.cpu?.system || 0), temp: Number(r.cpu?.temperature || 0),
      memory: Number(r.memory?.usage || 0), memoryUsed: Number(r.memory?.used || 0),
      load1: Number(r.loadAverage?.oneMinute ?? r.load?.one ?? 0), load5: Number(r.loadAverage?.fiveMinutes ?? r.load?.five ?? 0), load15: Number(r.loadAverage?.fifteenMinutes ?? r.load?.fifteen ?? 0),
      processes: Number(r.processes?.total || 0), running: Number(r.processes?.running || 0),
      rx: Number(net?.rxSpeed || 0) / 1024, tx: Number(net?.txSpeed || 0) / 1024,
      disk: Number(disk?.usage || 0)
    });
  });
  telemetry.getColumn("timestamp").numFmt = "dd-mmm-yyyy hh:mm:ss";
  ["cpu","cpuUser","cpuSystem","temp","memory","load1","load5","load15","rx","tx","disk"].forEach(k => telemetry.getColumn(k).numFmt = "0.00");
  telemetry.getColumn("memoryUsed").numFmt = "#,##0";
  telemetry.autoFilter = { from: "A1", to: "O1" };
  telemetry.eachRow((row, idx) => { if (idx > 1 && idx % 2 === 0) row.eachCell(c => c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F7FA" } }); });
  telemetry.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  const raw = wb.addWorksheet("Raw Snapshot", { views: [{ showGridLines: false }] });
  raw.getCell("A1").value = "Current Firebase Snapshot (JSON)";
  raw.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF163A5F" } };
  raw.getCell("A3").value = JSON.stringify(current || {}, null, 2);
  raw.getCell("A3").alignment = { wrapText: true, vertical: "top" };
  raw.getColumn("A").width = 120;

  return wb;
}

async function downloadReport(type, button) {
  const period = periods[type];
  if (!period) return;
  const status = $("reportStatus");
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = "Generating...";
  status.className = "report-status";
  status.textContent = `Loading ${period.label.toLowerCase()} history from Firebase...`;

  try {
    const now = Date.now();
    const from = now - period.days * 86400000;
    const histQuery = query(ref(db, `servers/${SERVER_ID}/history`), orderByChild("timestamp"), startAt(from), endAt(now));
    const [histSnap, currentSnap] = await Promise.all([get(histQuery), get(ref(db, `servers/${SERVER_ID}/current`))]);
    const rows = flattenHistory(histSnap.val());
    const current = currentSnap.val() || {};
    if (!rows.length) throw new Error("Tidak ada historical data untuk periode ini. Collector harus menulis servers/anastudio/history terlebih dahulu.");

    status.textContent = `Building workbook from ${rows.length.toLocaleString("id-ID")} samples...`;
    const wb = await buildWorkbook(period, rows, current);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `AquaNova_ANASTUDIO_${period.label}_Report_${stamp}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    status.className = "report-status success";
    status.textContent = `Report selesai: ${rows.length.toLocaleString("id-ID")} telemetry samples exported.`;
    toast(`${period.label} report berhasil dibuat`);
  } catch (e) {
    console.error(e);
    status.className = "report-status error";
    status.textContent = e.message || "Gagal membuat report.";
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
}

export function initReports() {
  document.querySelectorAll(".report-button").forEach((button) => button.addEventListener("click", () => downloadReport(button.dataset.report, button)));
}
