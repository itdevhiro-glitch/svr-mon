import { ref, query, orderByChild, startAt, endAt, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { db, SERVER_ID } from "./firebase-config.js";
import { $, fmtBytes, getRootStorage, getPrimaryNetwork, toast, healthScore } from "./utils.js";

const periods = {
  daily: { label: "Daily", days: 1 },
  weekly: { label: "Weekly", days: 7 },
  monthly: { label: "Monthly", days: 30 }
};

const C = {
  navy: "FF0D2235", blue: "FF163A5F", cyan: "FF4BB4FF", pale: "FFEAF4FC",
  ink: "FF183247", muted: "FF66788A", line: "FFD8E4EE", white: "FFFFFFFF",
  green: "FF20A56B", amber: "FFF0A43A", red: "FFE34D5B", soft: "FFF6F9FC"
};

function flattenHistory(obj) {
  return Object.values(obj || {}).filter((x) => x && x.timestamp).sort((a, b) => a.timestamp - b.timestamp);
}
function vals(rows, getter) { return rows.map(getter).map(Number).filter(Number.isFinite); }
function avg(rows, getter) { const v = vals(rows, getter); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : 0; }
function max(rows, getter) { const v = vals(rows, getter); return v.length ? Math.max(...v) : 0; }
function min(rows, getter) { const v = vals(rows, getter); return v.length ? Math.min(...v) : 0; }
function sum(rows, getter) { return vals(rows, getter).reduce((a,b)=>a+b,0); }
function pct(n) { return `${Number(n || 0).toFixed(2)}%`; }
function dt(ms) { return new Date(Number(ms || 0)); }
function idDate(ms) { return dt(ms).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }); }
function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function getNet(r) { return getPrimaryNetwork(r?.network || r?.network?.traffic || []); }
function getDisk(r) { return getRootStorage(r?.storage || []); }
function getLoad1(r) { return safeNum(r?.loadAverage?.oneMinute ?? r?.load?.one); }

function metricStyle(cell, value, warning=75, critical=90) {
  const n = Number(value || 0);
  cell.font = { bold: true, size: 16, color: { argb: n >= critical ? C.red : n >= warning ? C.amber : C.green } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}
function section(cell, text) {
  cell.value = text;
  cell.font = { bold: true, size: 10, color: { argb: C.cyan } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy } };
  cell.alignment = { vertical: "middle" };
}
function styleHeader(row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: C.white }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.blue } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "thin", color: { argb: C.cyan } } };
  });
}
function borderRange(ws, range) {
  const [a,b] = range.split(":");
  const s = ws.getCell(a), e = ws.getCell(b);
  for (let r=s.row; r<=e.row; r++) for (let c=s.col; c<=e.col; c++) {
    ws.getCell(r,c).border = {
      top:{style:"hair",color:{argb:C.line}}, bottom:{style:"hair",color:{argb:C.line}},
      left:{style:"hair",color:{argb:C.line}}, right:{style:"hair",color:{argb:C.line}}
    };
  }
}
function fillByRisk(cell, value, warn=75, crit=90) {
  const n = Number(value || 0);
  const color = n >= crit ? "FFFFE7EA" : n >= warn ? "FFFFF3DD" : "FFEAF8F1";
  cell.fill = { type:"pattern", pattern:"solid", fgColor:{argb:color} };
  cell.font = { color:{argb:n >= crit ? C.red : n >= warn ? C.amber : C.green}, bold:true };
}

async function addLogo(wb, ws) {
  try {
    const res = await fetch("assets/img/aquanova-logo.png");
    if (!res.ok) return;
    const buf = await res.arrayBuffer();
    let binary = ""; const bytes = new Uint8Array(buf);
    for (let i=0;i<bytes.byteLength;i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const imageId = wb.addImage({ base64: `data:image/png;base64,${base64}`, extension: "png" });
    ws.addImage(imageId, { tl: { col: 0.2, row: 0.15 }, ext: { width: 64, height: 64 } });
  } catch (e) { console.warn("Logo report tidak dimuat:", e); }
}

function aggregate(rows, mode="hour") {
  const groups = new Map();
  for (const r of rows) {
    const d = dt(r.timestamp);
    const key = mode === "day"
      ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
      : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:00`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.entries()].map(([key, g]) => ({
    period: key, samples: g.length,
    cpuAvg: avg(g,r=>r.cpu?.usage), cpuMin: min(g,r=>r.cpu?.usage), cpuMax: max(g,r=>r.cpu?.usage),
    ramAvg: avg(g,r=>r.memory?.usage), ramMin: min(g,r=>r.memory?.usage), ramMax: max(g,r=>r.memory?.usage),
    tempAvg: avg(g,r=>r.cpu?.temperature), tempMax: max(g,r=>r.cpu?.temperature),
    loadAvg: avg(g,getLoad1), diskAvg: avg(g,r=>getDisk(r)?.usage),
    rxAvgKB: avg(g,r=>safeNum(getNet(r)?.rxSpeed)/1024), txAvgKB: avg(g,r=>safeNum(getNet(r)?.txSpeed)/1024),
    procAvg: avg(g,r=>r.processes?.total), procMax: max(g,r=>r.processes?.total)
  }));
}

function addPivotSheet(wb, title, data) {
  const ws = wb.addWorksheet(title, { views:[{state:"frozen", ySplit:4, showGridLines:false}] });
  ws.mergeCells("A1:N1"); ws.getCell("A1").value = `${title.toUpperCase()} — PERFORMANCE SUMMARY`;
  ws.getCell("A1").font = { bold:true, size:18, color:{argb:C.white} };
  ws.getCell("A1").fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.navy} };
  ws.getCell("A1").alignment = { vertical:"middle" }; ws.getRow(1).height = 30;
  ws.mergeCells("A2:N2"); ws.getCell("A2").value = "Pivot-style analytical summary generated automatically from Firebase telemetry.";
  ws.getCell("A2").font = { italic:true, color:{argb:C.muted} };
  const headers = ["Period","Samples","CPU Avg %","CPU Min %","CPU Max %","RAM Avg %","RAM Min %","RAM Max %","Temp Avg °C","Temp Max °C","Load Avg","Disk Avg %","RX Avg KB/s","TX Avg KB/s","Proc Avg","Proc Max"];
  ws.getRow(4).values = headers; styleHeader(ws.getRow(4));
  data.forEach((x,i)=>{
    const row = ws.getRow(5+i);
    row.values = [x.period,x.samples,x.cpuAvg,x.cpuMin,x.cpuMax,x.ramAvg,x.ramMin,x.ramMax,x.tempAvg,x.tempMax,x.loadAvg,x.diskAvg,x.rxAvgKB,x.txAvgKB,x.procAvg,x.procMax];
    if (i%2===1) row.eachCell(c=>c.fill={type:"pattern",pattern:"solid",fgColor:{argb:C.soft}});
    [3,4,5,6,7,8,9,10,11,12,13,14,15].forEach(c=>row.getCell(c).numFmt="0.00");
    fillByRisk(row.getCell(5), x.cpuMax); fillByRisk(row.getCell(8), x.ramMax); fillByRisk(row.getCell(12), x.diskAvg,80,90);
  });
  ws.autoFilter = { from:"A4", to:`P${Math.max(5,4+data.length)}` };
  ws.columns = [{width:19},{width:10},...Array(14).fill({width:13})];
  ws.pageSetup = { orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0, paperSize:9 };
  return ws;
}

async function buildWorkbook(period, rows, current) {
  if (!window.ExcelJS) throw new Error("ExcelJS belum selesai dimuat. Refresh lalu coba lagi.");
  const wb = new window.ExcelJS.Workbook();
  wb.creator = "Aqua Nova Studio"; wb.company = "Aqua Nova Studio";
  wb.subject = `${period.label} Infrastructure Monitoring Report`; wb.created = new Date();

  const rootCurrent = getRootStorage(current?.storage || []);
  const coverageStart = rows.length ? rows[0].timestamp : Date.now();
  const coverageEnd = rows.length ? rows[rows.length-1].timestamp : Date.now();
  const score = healthScore(current || {});
  const cpuAvg = avg(rows,r=>r.cpu?.usage), cpuPeak = max(rows,r=>r.cpu?.usage);
  const ramAvg = avg(rows,r=>r.memory?.usage), ramPeak = max(rows,r=>r.memory?.usage);
  const tempAvg = avg(rows,r=>r.cpu?.temperature), tempPeak = max(rows,r=>r.cpu?.temperature);
  const diskAvg = avg(rows,r=>getDisk(r)?.usage);
  const rxAvg = avg(rows,r=>safeNum(getNet(r)?.rxSpeed)/1024), txAvg = avg(rows,r=>safeNum(getNet(r)?.txSpeed)/1024);

  // DASHBOARD
  const dash = wb.addWorksheet("Dashboard", { views:[{showGridLines:false}] });
  dash.columns = Array(12).fill(null).map((_,i)=>({width:i===0?4:14}));
  dash.getRow(1).height = 22; dash.getRow(2).height = 22; dash.getRow(3).height = 22;
  await addLogo(wb, dash);
  dash.mergeCells("B1:L2"); dash.getCell("B1").value = "AQUA NOVA STUDIO — INFRASTRUCTURE DASHBOARD";
  dash.getCell("B1").font = {bold:true,size:20,color:{argb:C.white}}; dash.getCell("B1").fill={type:"pattern",pattern:"solid",fgColor:{argb:C.navy}};
  dash.getCell("B1").alignment={vertical:"middle"};
  dash.mergeCells("B3:L3"); dash.getCell("B3").value = `${period.label} Report | ${current?.serverName || SERVER_ID} | ${idDate(coverageStart)} — ${idDate(coverageEnd)}`;
  dash.getCell("B3").font={color:{argb:C.muted},italic:true};

  const cards = [
    ["B5:D5","B6:D8","HEALTH SCORE",score,"/100",70,45],
    ["E5:G5","E6:G8","AVG CPU",cpuAvg,"%",75,90],
    ["H5:J5","H6:J8","PEAK CPU",cpuPeak,"%",75,90],
    ["K5:L5","K6:L8","AVG RAM",ramAvg,"%",75,90],
    ["B10:D10","B11:D13","PEAK RAM",ramPeak,"%",75,90],
    ["E10:G10","E11:G13","PEAK TEMP",tempPeak,"°C",60,70],
    ["H10:J10","H11:J13","ROOT DISK",safeNum(rootCurrent?.usage),"%",80,90],
    ["K10:L10","K11:L13","SAMPLES",rows.length,"",999999,999999]
  ];
  cards.forEach(([hdr,val,label,value,suffix,warn,crit])=>{
    dash.mergeCells(hdr); dash.getCell(hdr.split(":")[0]).value=label; section(dash.getCell(hdr.split(":")[0]),label);
    dash.mergeCells(val); const c=dash.getCell(val.split(":")[0]); c.value=`${Number(value||0).toFixed(suffix?2:0)}${suffix}`;
    metricStyle(c,value,warn,crit); c.fill={type:"pattern",pattern:"solid",fgColor:{argb:C.soft}};
  });

  section(dash.getCell("B15"),"PERFORMANCE PROFILE"); dash.mergeCells("B15:L15");
  const perf = [
    ["CPU Average",cpuAvg,"CPU Peak",cpuPeak,"CPU Temperature Avg",tempAvg,"CPU Temperature Peak",tempPeak],
    ["RAM Average",ramAvg,"RAM Peak",ramPeak,"Disk Average",diskAvg,"Health Score",score],
    ["RX Average KB/s",rxAvg,"TX Average KB/s",txAvg,"Process Average",avg(rows,r=>r.processes?.total),"Process Peak",max(rows,r=>r.processes?.total)]
  ];
  let rr=16;
  perf.forEach(line=>{
    for(let i=0;i<line.length;i+=2){ const col=2+(i/2)*3; const lc=dash.getCell(rr,col), vc=dash.getCell(rr,col+1); lc.value=line[i]; vc.value=line[i+1]; lc.font={bold:true,color:{argb:C.muted}}; vc.font={bold:true,color:{argb:C.ink}}; vc.numFmt="0.00"; }
    rr++;
  });
  borderRange(dash,"B16:L18");

  const hourly = aggregate(rows,"hour");
  section(dash.getCell("B20"),"RECENT HOURLY TREND (PIVOT SUMMARY)"); dash.mergeCells("B20:L20");
  const trend = hourly.slice(-12);
  dash.getRow(21).values = [null,"Hour","CPU Avg %","CPU Max %","RAM Avg %","RAM Max %","Temp Max °C","Disk Avg %","RX KB/s","TX KB/s","Proc Avg","Samples"];
  for(let c=2;c<=12;c++){ const cell=dash.getCell(21,c); cell.font={bold:true,color:{argb:C.white}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:C.blue}};cell.alignment={horizontal:"center"}; }
  trend.forEach((x,i)=>{
    const row=22+i; const data=[x.period,x.cpuAvg,x.cpuMax,x.ramAvg,x.ramMax,x.tempMax,x.diskAvg,x.rxAvgKB,x.txAvgKB,x.procAvg,x.samples];
    data.forEach((v,j)=>{ const cell=dash.getCell(row,2+j); cell.value=v; if(j>0&&j<10) cell.numFmt="0.00"; });
    fillByRisk(dash.getCell(row,4),x.cpuMax); fillByRisk(dash.getCell(row,6),x.ramMax); fillByRisk(dash.getCell(row,8),x.diskAvg,80,90);
  });
  dash.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:1,paperSize:9};
  dash.headerFooter.oddFooter="&LAqua Nova Studio&CInfrastructure Monitoring Dashboard&RPage &P of &N";

  // EXECUTIVE SUMMARY
  const summary = wb.addWorksheet("Executive Summary", { views:[{showGridLines:false}] });
  summary.columns=[{width:26},{width:30},{width:4},{width:26},{width:24},{width:18},{width:18},{width:18}];
  summary.mergeCells("A1:H1"); summary.getCell("A1").value="AQUA NOVA STUDIO — EXECUTIVE SUMMARY"; summary.getCell("A1").font={bold:true,size:20,color:{argb:C.white}}; summary.getCell("A1").fill={type:"pattern",pattern:"solid",fgColor:{argb:C.navy}}; summary.getRow(1).height=32;
  summary.mergeCells("A2:H2"); summary.getCell("A2").value=`${period.label} infrastructure report · ${current?.serverName || SERVER_ID} · Generated ${new Date().toLocaleString("id-ID")}`; summary.getCell("A2").font={italic:true,color:{argb:C.muted}};
  section(summary.getCell("A4"),"REPORT INFORMATION"); section(summary.getCell("D4"),"KEY PERFORMANCE INDICATORS");
  const info=[
    ["Server",current?.serverName||SERVER_ID],["Hostname",current?.system?.hostname||"—"],["Requested Period",`${period.days} day(s)`],
    ["Actual Coverage",`${idDate(coverageStart)} — ${idDate(coverageEnd)}`],["Samples",rows.length],["OS",`${current?.system?.distro||""} ${current?.system?.release||""}`.trim()||"—"]
  ];
  info.forEach((r,i)=>{summary.getCell(`A${5+i}`).value=r[0];summary.getCell(`B${5+i}`).value=r[1];summary.getCell(`A${5+i}`).font={bold:true,color:{argb:C.muted}};});
  const kpis=[["Health Score",score,"/100"],["Avg CPU",cpuAvg,"%"],["Peak CPU",cpuPeak,"%"],["Avg RAM",ramAvg,"%"],["Peak RAM",ramPeak,"%"],["CPU Temp Max",tempPeak,"°C"],["Current Disk",safeNum(rootCurrent?.usage),"%"]];
  kpis.forEach((r,i)=>{summary.getCell(`D${5+i}`).value=r[0];summary.getCell(`E${5+i}`).value=`${Number(r[1]).toFixed(2)} ${r[2]}`;summary.getCell(`D${5+i}`).font={bold:true,color:{argb:C.muted}};});
  section(summary.getCell("A14"),"CAPACITY SNAPSHOT");
  const cap=[["Memory Total",fmtBytes(current?.memory?.total)],["Memory Used",fmtBytes(current?.memory?.used)],["Root Storage Total",fmtBytes(rootCurrent?.total)],["Root Storage Used",fmtBytes(rootCurrent?.used)],["Process Count",current?.processes?.total??"—"],["Uptime Seconds",current?.system?.uptime??"—"]];
  cap.forEach((r,i)=>{summary.getCell(`A${15+i}`).value=r[0];summary.getCell(`B${15+i}`).value=r[1];summary.getCell(`A${15+i}`).font={bold:true,color:{argb:C.muted}};});
  summary.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};

  // PIVOT-STYLE SUMMARIES
  addPivotSheet(wb,"Pivot - Hourly",hourly);
  addPivotSheet(wb,"Pivot - Daily",aggregate(rows,"day"));

  // TELEMETRY DATASET
  const telemetry=wb.addWorksheet("Telemetry",{views:[{state:"frozen",ySplit:1,showGridLines:false}]});
  telemetry.columns=[
    {header:"Timestamp",key:"timestamp",width:23},{header:"CPU %",key:"cpu",width:12},{header:"CPU User %",key:"cpuUser",width:12},{header:"CPU System %",key:"cpuSystem",width:14},{header:"CPU Temp °C",key:"temp",width:14},
    {header:"Memory %",key:"memory",width:13},{header:"Memory Used",key:"memoryUsed",width:16},{header:"Load 1m",key:"load1",width:12},{header:"Load 5m",key:"load5",width:12},{header:"Load 15m",key:"load15",width:12},
    {header:"Processes",key:"processes",width:12},{header:"Running",key:"running",width:11},{header:"RX KB/s",key:"rx",width:13},{header:"TX KB/s",key:"tx",width:13},{header:"Root Disk %",key:"disk",width:13}
  ];
  styleHeader(telemetry.getRow(1));
  rows.forEach(r=>{const net=getNet(r),disk=getDisk(r);telemetry.addRow({timestamp:dt(r.timestamp),cpu:safeNum(r.cpu?.usage),cpuUser:safeNum(r.cpu?.user),cpuSystem:safeNum(r.cpu?.system),temp:safeNum(r.cpu?.temperature),memory:safeNum(r.memory?.usage),memoryUsed:safeNum(r.memory?.used),load1:getLoad1(r),load5:safeNum(r.loadAverage?.fiveMinutes??r.load?.five),load15:safeNum(r.loadAverage?.fifteenMinutes??r.load?.fifteen),processes:safeNum(r.processes?.total),running:safeNum(r.processes?.running),rx:safeNum(net?.rxSpeed)/1024,tx:safeNum(net?.txSpeed)/1024,disk:safeNum(disk?.usage)});});
  telemetry.getColumn("timestamp").numFmt="dd-mmm-yyyy hh:mm:ss";
  ["cpu","cpuUser","cpuSystem","temp","memory","load1","load5","load15","rx","tx","disk"].forEach(k=>telemetry.getColumn(k).numFmt="0.00");
  telemetry.getColumn("memoryUsed").numFmt="#,##0"; telemetry.autoFilter={from:"A1",to:"O1"};
  telemetry.eachRow((row,idx)=>{if(idx>1&&idx%2===0)row.eachCell(c=>c.fill={type:"pattern",pattern:"solid",fgColor:{argb:C.soft}});});
  telemetry.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0};

  // CURRENT SNAPSHOT
  const snap=wb.addWorksheet("Current Snapshot",{views:[{showGridLines:false}]});
  snap.columns=[{width:28},{width:42},{width:28},{width:42}];
  snap.mergeCells("A1:D1");snap.getCell("A1").value="CURRENT SERVER SNAPSHOT";snap.getCell("A1").font={bold:true,size:18,color:{argb:C.white}};snap.getCell("A1").fill={type:"pattern",pattern:"solid",fgColor:{argb:C.navy}};
  const snapshotRows=[
    ["Server",current?.serverName||SERVER_ID,"Hostname",current?.system?.hostname||"—"],["Kernel",current?.system?.kernel||"—","Architecture",current?.system?.architecture||"—"],
    ["CPU Model",current?.cpu?.brand||current?.cpu?.model||"—","CPU Cores",`${current?.cpu?.physicalCores??"—"} physical / ${current?.cpu?.logicalCores??"—"} logical`],
    ["CPU Usage",pct(current?.cpu?.usage),"CPU Temp",`${current?.cpu?.temperature??"—"} °C`],["RAM Usage",pct(current?.memory?.usage),"RAM Used",fmtBytes(current?.memory?.used)],
    ["Root Disk",pct(rootCurrent?.usage),"Processes",current?.processes?.total??"—"],["Uptime",current?.system?.uptime??"—","Last Heartbeat",idDate(current?.heartbeat||current?.timestamp)]
  ];
  snapshotRows.forEach((r,i)=>{const row=3+i;[1,2,3,4].forEach(c=>snap.getCell(row,c).value=r[c-1]);snap.getCell(row,1).font={bold:true,color:{argb:C.muted}};snap.getCell(row,3).font={bold:true,color:{argb:C.muted}};});
  borderRange(snap,`A3:D${2+snapshotRows.length}`);

  // RAW JSON
  const raw=wb.addWorksheet("Raw Snapshot",{views:[{showGridLines:false}]});
  raw.getCell("A1").value="Current Firebase Snapshot (JSON)";raw.getCell("A1").font={bold:true,size:14,color:{argb:C.blue}};
  raw.getCell("A3").value=JSON.stringify(current||{},null,2);raw.getCell("A3").alignment={wrapText:true,vertical:"top"};raw.getColumn("A").width=120;

  // README
  const readme=wb.addWorksheet("Report Guide",{views:[{showGridLines:false}]});
  readme.columns=[{width:28},{width:95}];readme.getCell("A1").value="REPORT GUIDE";readme.getCell("A1").font={bold:true,size:18,color:{argb:C.blue}};
  const guide=[
    ["Dashboard","Management-ready KPI dashboard with health, resource peaks, and recent hourly trend."],
    ["Executive Summary","Report scope, coverage, capacity snapshot, and key KPIs."],
    ["Pivot - Hourly","Automatic pivot-style grouping by hour with AVG/MIN/MAX CPU/RAM, temperature, disk, traffic and processes."],
    ["Pivot - Daily","Automatic pivot-style daily aggregation for longer-term trend review."],
    ["Telemetry","Complete historical dataset used by the report; filterable in Excel."],
    ["Current Snapshot","Current server identity and infrastructure state."],
    ["Raw Snapshot","Raw Firebase current JSON for audit/troubleshooting."],
    ["Note","ExcelJS generates pivot-style summary tables, not native Excel PivotTable objects. All summaries are already calculated and ready to filter/sort."]
  ];
  guide.forEach((r,i)=>{readme.getCell(`A${3+i}`).value=r[0];readme.getCell(`B${3+i}`).value=r[1];readme.getCell(`A${3+i}`).font={bold:true,color:{argb:C.muted}};readme.getCell(`B${3+i}`).alignment={wrapText:true};});
  return wb;
}

async function downloadReport(type,button){
  const period=periods[type];if(!period)return;const status=$("reportStatus"),oldText=button.textContent;button.disabled=true;button.textContent="Generating...";status.className="report-status";status.textContent=`Loading ${period.label.toLowerCase()} history from Firebase...`;
  try{
    const now=Date.now(),from=now-period.days*86400000;const histQuery=query(ref(db,`servers/${SERVER_ID}/history`),orderByChild("timestamp"),startAt(from),endAt(now));
    const [histSnap,currentSnap]=await Promise.all([get(histQuery),get(ref(db,`servers/${SERVER_ID}/current`))]);const rows=flattenHistory(histSnap.val()),current=currentSnap.val()||{};
    if(!rows.length)throw new Error("Tidak ada historical data untuk periode ini. Collector harus menulis servers/anastudio/history terlebih dahulu.");
    status.textContent=`Building professional dashboard + pivot summaries from ${rows.length.toLocaleString("id-ID")} samples...`;
    const wb=await buildWorkbook(period,rows,current),buffer=await wb.xlsx.writeBuffer(),blob=new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),url=URL.createObjectURL(blob),a=document.createElement("a"),stamp=new Date().toISOString().slice(0,10);
    a.href=url;a.download=`AquaNova_ANASTUDIO_${period.label}_Professional_Report_${stamp}.xlsx`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    status.className="report-status success";status.textContent=`Professional report selesai: dashboard + pivot summaries + ${rows.length.toLocaleString("id-ID")} telemetry samples.`;toast(`${period.label} professional report berhasil dibuat`);
  }catch(e){console.error(e);status.className="report-status error";status.textContent=e.message||"Gagal membuat report.";}finally{button.disabled=false;button.textContent=oldText;}
}

export function initReports(){document.querySelectorAll(".report-button").forEach(button=>button.addEventListener("click",()=>downloadReport(button.dataset.report,button)));}
