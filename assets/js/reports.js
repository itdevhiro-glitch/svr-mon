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

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function nz(v) { return safeNum(v, 0); }
function firstNum(...values) {
  for (const v of values) {
    const n = safeNum(v, null);
    if (n !== null) return n;
  }
  return null;
}
function flattenHistory(obj) {
  return Object.values(obj || {}).filter(x => x && x.timestamp).sort((a,b) => Number(a.timestamp)-Number(b.timestamp));
}
function idDate(ms) {
  const n = safeNum(ms, null);
  if (n === null) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Jakarta"
  }).format(new Date(n));
}
function jakartaDateStamp(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year:"numeric", month:"2-digit", day:"2-digit", timeZone:"Asia/Jakarta"
  }).formatToParts(new Date(ms));
  const o = Object.fromEntries(parts.map(p => [p.type,p.value]));
  return `${o.year}-${o.month}-${o.day}`;
}
function jakartaHourLabel(ms) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit",
    hourCycle:"h23", timeZone:"Asia/Jakarta"
  }).formatToParts(new Date(Number(ms)));
  const o = Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${o.year}-${o.month}-${o.day} ${o.hour}:00 WIB`;
}
function fmtReportTime(r) {
  if (r?.period && /^\d{4}-\d{2}-\d{2}_\d{2}$/.test(r.period)) {
    return `${r.period.replace("_"," ")}:00 WIB`;
  }
  return jakartaHourLabel(r.timestamp);
}
function jakartaDayKey(ms) { return jakartaDateStamp(ms); }
function pct(n) { return safeNum(n,null) === null ? "—" : `${Number(n).toFixed(2)}%`; }

function weightedAvg(rows, field) {
  let total = 0, weight = 0;
  for (const r of rows) {
    const v = safeNum(r[field], null);
    if (v === null) continue;
    const w = Math.max(1, nz(r.samples));
    total += v * w;
    weight += w;
  }
  return weight ? total / weight : null;
}
function minVal(rows, field) {
  const a = rows.map(r=>safeNum(r[field],null)).filter(v=>v!==null);
  return a.length ? Math.min(...a) : null;
}
function maxVal(rows, field) {
  const a = rows.map(r=>safeNum(r[field],null)).filter(v=>v!==null);
  return a.length ? Math.max(...a) : null;
}
function sumVal(rows, field) {
  const a = rows.map(r=>safeNum(r[field],null)).filter(v=>v!==null);
  return a.length ? a.reduce((x,y)=>x+y,0) : null;
}

function oldNet(raw) {
  const n = raw?.network;
  if (Array.isArray(n)) return getPrimaryNetwork(n);
  if (Array.isArray(n?.traffic)) return getPrimaryNetwork(n.traffic);
  return null;
}
function oldDisk(raw) {
  return getRootStorage(raw?.storage || []);
}

function normalizeHistoryRow(raw) {
  const netOld = oldNet(raw);
  const diskOld = oldDisk(raw);
  const hourly = raw?.cpu?.avg !== undefined || raw?.period || raw?.samples > 1;

  const cpuAvg = firstNum(raw?.cpu?.avg, raw?.cpu?.usage);
  const cpuMin = firstNum(raw?.cpu?.min, raw?.cpu?.usage);
  const cpuMax = firstNum(raw?.cpu?.max, raw?.cpu?.usage);

  const ramAvg = firstNum(raw?.memory?.avg, raw?.memory?.usage);
  const ramMin = firstNum(raw?.memory?.min, raw?.memory?.usage);
  const ramMax = firstNum(raw?.memory?.max, raw?.memory?.usage);

  const tempAvg = firstNum(raw?.temperature?.avg, raw?.cpu?.temperature);
  const tempMax = firstNum(raw?.temperature?.max, raw?.cpu?.temperature);

  const load1Avg = firstNum(raw?.load?.load1Avg, raw?.load?.avg, raw?.loadAverage?.oneMinute, raw?.load?.one);
  const load1Max = firstNum(raw?.load?.load1Max, raw?.load?.max, raw?.loadAverage?.oneMinute, raw?.load?.one);

  const rxAvgBps = firstNum(raw?.network?.rxAvgSpeed, netOld?.rxSpeed);
  const txAvgBps = firstNum(raw?.network?.txAvgSpeed, netOld?.txSpeed);
  const rxPeakBps = firstNum(raw?.network?.rxPeakSpeed, netOld?.rxSpeed);
  const txPeakBps = firstNum(raw?.network?.txPeakSpeed, netOld?.txSpeed);

  const rootAvg = firstNum(raw?.storage?.rootAvg, raw?.storage?.avg, raw?.disk?.avg, diskOld?.usage);
  const rootMax = firstNum(raw?.storage?.rootMax, raw?.storage?.max, raw?.disk?.max, diskOld?.usage);
  const rootEnd = firstNum(raw?.storage?.rootEnd, raw?.storage?.end, raw?.disk?.end, diskOld?.usage);

  return {
    timestamp: nz(raw?.timestamp),
    period: raw?.period || null,
    samples: Math.max(1, nz(raw?.samples) || 1),
    schema: hourly ? "hourly" : "legacy",

    cpuAvg, cpuMin, cpuMax,
    cpuUserAvg: firstNum(raw?.cpu?.userAvg, raw?.cpu?.user),
    cpuSystemAvg: firstNum(raw?.cpu?.systemAvg, raw?.cpu?.system),

    tempAvg, tempMax,

    ramAvg, ramMin, ramMax,
    memoryUsedAvg: firstNum(raw?.memory?.usedAvg, raw?.memory?.used),

    load1Avg, load1Max,
    load5Avg: firstNum(raw?.load?.load5Avg, raw?.loadAverage?.fiveMinutes, raw?.load?.five),
    load15Avg: firstNum(raw?.load?.load15Avg, raw?.loadAverage?.fifteenMinutes, raw?.load?.fifteen),

    procAvg: firstNum(raw?.processes?.avg, raw?.processes?.total),
    procMax: firstNum(raw?.processes?.max, raw?.processes?.total),
    runningAvg: firstNum(raw?.processes?.runningAvg, raw?.processes?.running),
    runningMax: firstNum(raw?.processes?.runningMax, raw?.processes?.running),

    rxAvgKB: rxAvgBps === null ? null : rxAvgBps / 1024,
    rxPeakKB: rxPeakBps === null ? null : rxPeakBps / 1024,
    txAvgKB: txAvgBps === null ? null : txAvgBps / 1024,
    txPeakKB: txPeakBps === null ? null : txPeakBps / 1024,
    rxTotalMB: safeNum(raw?.network?.rxBytes,null) === null ? null : safeNum(raw.network.rxBytes)/1048576,
    txTotalMB: safeNum(raw?.network?.txBytes,null) === null ? null : safeNum(raw.network.txBytes)/1048576,

    rootAvg, rootMax, rootEnd
  };
}
function normalizeRows(rawRows) {
  return rawRows.map(normalizeHistoryRow).sort((a,b)=>a.timestamp-b.timestamp);
}
function aggregateDaily(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = r.period?.slice(0,10) || jakartaDayKey(r.timestamp);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.entries()].map(([period,g]) => ({
    period,
    timestamp: Math.min(...g.map(x=>x.timestamp)),
    samples: g.reduce((a,x)=>a+nz(x.samples),0),
    cpuAvg: weightedAvg(g,"cpuAvg"),
    cpuMin: minVal(g,"cpuMin"),
    cpuMax: maxVal(g,"cpuMax"),
    cpuUserAvg: weightedAvg(g,"cpuUserAvg"),
    cpuSystemAvg: weightedAvg(g,"cpuSystemAvg"),
    tempAvg: weightedAvg(g,"tempAvg"),
    tempMax: maxVal(g,"tempMax"),
    ramAvg: weightedAvg(g,"ramAvg"),
    ramMin: minVal(g,"ramMin"),
    ramMax: maxVal(g,"ramMax"),
    memoryUsedAvg: weightedAvg(g,"memoryUsedAvg"),
    load1Avg: weightedAvg(g,"load1Avg"),
    load1Max: maxVal(g,"load1Max"),
    load5Avg: weightedAvg(g,"load5Avg"),
    load15Avg: weightedAvg(g,"load15Avg"),
    procAvg: weightedAvg(g,"procAvg"),
    procMax: maxVal(g,"procMax"),
    runningAvg: weightedAvg(g,"runningAvg"),
    runningMax: maxVal(g,"runningMax"),
    rxAvgKB: weightedAvg(g,"rxAvgKB"),
    rxPeakKB: maxVal(g,"rxPeakKB"),
    txAvgKB: weightedAvg(g,"txAvgKB"),
    txPeakKB: maxVal(g,"txPeakKB"),
    rxTotalMB: sumVal(g,"rxTotalMB"),
    txTotalMB: sumVal(g,"txTotalMB"),
    rootAvg: weightedAvg(g,"rootAvg"),
    rootMax: maxVal(g,"rootMax"),
    rootEnd: [...g].sort((a,b)=>a.timestamp-b.timestamp).map(x=>x.rootEnd).filter(v=>v!==null).at(-1) ?? null
  }));
}

function metricStyle(cell, value, warning=75, critical=90) {
  const n = safeNum(value, null);
  cell.font = { bold:true, size:16, color:{argb:n===null?C.muted:n>=critical?C.red:n>=warning?C.amber:C.green} };
  cell.alignment = { horizontal:"center", vertical:"middle" };
}
function section(cell, text) {
  cell.value=text;
  cell.font={bold:true,size:10,color:{argb:C.cyan}};
  cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:C.navy}};
  cell.alignment={vertical:"middle"};
}
function styleHeader(row) {
  row.height=24;
  row.eachCell(cell=>{
    cell.font={bold:true,color:{argb:C.white},size:10};
    cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:C.blue}};
    cell.alignment={vertical:"middle",horizontal:"center",wrapText:true};
    cell.border={bottom:{style:"thin",color:{argb:C.cyan}}};
  });
}
function borderRange(ws, range) {
  const [a,b]=range.split(":");const s=ws.getCell(a),e=ws.getCell(b);
  for(let r=s.row;r<=e.row;r++)for(let c=s.col;c<=e.col;c++){
    ws.getCell(r,c).border={
      top:{style:"hair",color:{argb:C.line}},bottom:{style:"hair",color:{argb:C.line}},
      left:{style:"hair",color:{argb:C.line}},right:{style:"hair",color:{argb:C.line}}
    };
  }
}
function fillByRisk(cell, value, warn=75, crit=90) {
  const n=safeNum(value,null);
  if(n===null){
    cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF3F5F7"}};
    cell.font={color:{argb:C.muted},italic:true};
    return;
  }
  const color=n>=crit?"FFFFE7EA":n>=warn?"FFFFF3DD":"FFEAF8F1";
  cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:color}};
  cell.font={color:{argb:n>=crit?C.red:n>=warn?C.amber:C.green},bold:true};
}
async function addLogo(wb, ws) {
  try{
    const res=await fetch("assets/img/aquanova-logo.png");
    if(!res.ok)return;
    const buf=await res.arrayBuffer();let binary="";const bytes=new Uint8Array(buf);
    for(let i=0;i<bytes.byteLength;i++)binary+=String.fromCharCode(bytes[i]);
    const imageId=wb.addImage({base64:`data:image/png;base64,${btoa(binary)}`,extension:"png"});
    ws.addImage(imageId,{tl:{col:0.2,row:0.15},ext:{width:64,height:64}});
  }catch(e){console.warn("Logo report tidak dimuat:",e);}
}

function pivotRowsHourly(rows) {
  return rows.map(r=>({...r,period:r.period?`${r.period.replace("_"," ")}:00 WIB`:jakartaHourLabel(r.timestamp)}));
}
function addPivotSheet(wb,title,data,isDaily=false) {
  const ws=wb.addWorksheet(title,{views:[{state:"frozen",ySplit:4,showGridLines:false}]});
  ws.mergeCells("A1:U1");ws.getCell("A1").value=`${title.toUpperCase()} — PERFORMANCE SUMMARY`;
  ws.getCell("A1").font={bold:true,size:18,color:{argb:C.white}};
  ws.getCell("A1").fill={type:"pattern",pattern:"solid",fgColor:{argb:C.navy}};
  ws.mergeCells("A2:U2");
  ws.getCell("A2").value=isDaily
    ?"Daily roll-up from hourly aggregates. Average metrics are weighted by underlying sample count."
    :"One row per calendar-hour aggregate. Missing collector fields stay blank, never false 0.00.";
  ws.getCell("A2").font={italic:true,color:{argb:C.muted}};
  const headers=["Period","5s Samples","CPU Avg %","CPU Min %","CPU Peak %","RAM Avg %","RAM Min %","RAM Peak %","Temp Avg °C","Temp Peak °C","Load 1m Avg","Load 1m Peak","Proc Avg","Proc Peak","RX Avg KB/s","RX Peak KB/s","RX Total MB","TX Avg KB/s","TX Peak KB/s","TX Total MB","Root Disk Avg %"];
  ws.getRow(4).values=headers;styleHeader(ws.getRow(4));
  data.forEach((x,i)=>{
    const row=ws.getRow(5+i);
    row.values=[x.period,x.samples,x.cpuAvg,x.cpuMin,x.cpuMax,x.ramAvg,x.ramMin,x.ramMax,x.tempAvg,x.tempMax,x.load1Avg,x.load1Max,x.procAvg,x.procMax,x.rxAvgKB,x.rxPeakKB,x.rxTotalMB,x.txAvgKB,x.txPeakKB,x.txTotalMB,x.rootAvg];
    if(i%2===1)row.eachCell(c=>c.fill={type:"pattern",pattern:"solid",fgColor:{argb:C.soft}});
    for(let c=3;c<=21;c++)row.getCell(c).numFmt="0.00";
    fillByRisk(row.getCell(5),x.cpuMax);fillByRisk(row.getCell(8),x.ramMax);fillByRisk(row.getCell(21),x.rootAvg,80,90);
  });
  ws.autoFilter={from:"A4",to:`U${Math.max(5,4+data.length)}`};
  ws.columns=[{width:23},{width:12},...Array(19).fill({width:14})];
  ws.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};
  return ws;
}

async function buildWorkbook(period,rawRows,current) {
  if(!window.ExcelJS)throw new Error("ExcelJS belum selesai dimuat. Refresh lalu coba lagi.");
  const rows=normalizeRows(rawRows);
  const wb=new window.ExcelJS.Workbook();
  wb.creator="Aqua Nova Studio";wb.company="Aqua Nova Studio";
  wb.subject=`${period.label} Infrastructure Monitoring Report`;wb.created=new Date();

  const rootCurrent=getRootStorage(current?.storage||[]);
  const coverageStart=rows.length?rows[0].timestamp:Date.now();
  const coverageEnd=rows.length?rows[rows.length-1].timestamp:Date.now();
  const score=healthScore(current||{});
  const sampleTotal=rows.reduce((a,r)=>a+nz(r.samples),0);

  const cpuAvg=weightedAvg(rows,"cpuAvg"),cpuPeak=maxVal(rows,"cpuMax");
  const ramAvg=weightedAvg(rows,"ramAvg"),ramPeak=maxVal(rows,"ramMax");
  const tempAvg=weightedAvg(rows,"tempAvg"),tempPeak=maxVal(rows,"tempMax");
  const diskAvg=weightedAvg(rows,"rootAvg");
  const rxAvg=weightedAvg(rows,"rxAvgKB"),txAvg=weightedAvg(rows,"txAvgKB");
  const rxTotal=sumVal(rows,"rxTotalMB"),txTotal=sumVal(rows,"txTotalMB");

  const dash=wb.addWorksheet("Dashboard",{views:[{showGridLines:false}]});
  dash.columns=Array(12).fill(null).map((_,i)=>({width:i===0?4:14}));
  await addLogo(wb,dash);
  dash.mergeCells("B1:L2");dash.getCell("B1").value="AQUA NOVA STUDIO — INFRASTRUCTURE DASHBOARD";
  dash.getCell("B1").font={bold:true,size:20,color:{argb:C.white}};
  dash.getCell("B1").fill={type:"pattern",pattern:"solid",fgColor:{argb:C.navy}};
  dash.mergeCells("B3:L3");dash.getCell("B3").value=`${period.label} Report | ${current?.serverName||SERVER_ID} | ${idDate(coverageStart)} — ${idDate(coverageEnd)} | WIB`;
  dash.getCell("B3").font={color:{argb:C.muted},italic:true};

  const cards=[
    ["B5:D5","B6:D8","HEALTH SCORE",score,"/100",70,45],
    ["E5:G5","E6:G8","AVG CPU",cpuAvg,"%",75,90],
    ["H5:J5","H6:J8","PEAK CPU",cpuPeak,"%",75,90],
    ["K5:L5","K6:L8","AVG RAM",ramAvg,"%",75,90],
    ["B10:D10","B11:D13","PEAK RAM",ramPeak,"%",75,90],
    ["E10:G10","E11:G13","PEAK TEMP",tempPeak,"°C",60,70],
    ["H10:J10","H11:J13","ROOT DISK NOW",safeNum(rootCurrent?.usage,null),"%",80,90],
    ["K10:L10","K11:L13","5s SAMPLES",sampleTotal,"",999999,999999]
  ];
  cards.forEach(([hdr,val,label,value,suffix,warn,crit])=>{
    dash.mergeCells(hdr);section(dash.getCell(hdr.split(":")[0]),label);
    dash.mergeCells(val);const c=dash.getCell(val.split(":")[0]);const n=safeNum(value,null);
    c.value=n===null?"N/A":`${n.toFixed(suffix?2:0)}${suffix}`;
    metricStyle(c,n,warn,crit);c.fill={type:"pattern",pattern:"solid",fgColor:{argb:C.soft}};
  });

  section(dash.getCell("B15"),"PERFORMANCE PROFILE");dash.mergeCells("B15:L15");
  const perf=[
    ["CPU Average",cpuAvg,"CPU Peak",cpuPeak,"CPU Temperature Avg",tempAvg,"CPU Temperature Peak",tempPeak],
    ["RAM Average",ramAvg,"RAM Peak",ramPeak,"Historical Disk Avg",diskAvg,"Health Score",score],
    ["RX Average KB/s",rxAvg,"TX Average KB/s",txAvg,"RX Total MB",rxTotal,"TX Total MB",txTotal]
  ];
  let rr=16;
  perf.forEach(line=>{
    for(let i=0;i<line.length;i+=2){
      const col=2+(i/2)*3,lc=dash.getCell(rr,col),vc=dash.getCell(rr,col+1);
      lc.value=line[i];vc.value=safeNum(line[i+1],null)===null?"N/A":line[i+1];
      lc.font={bold:true,color:{argb:C.muted}};vc.font={bold:true,color:{argb:C.ink}};vc.numFmt="0.00";
    }rr++;
  });
  borderRange(dash,"B16:L18");

  const hourly=pivotRowsHourly(rows);
  section(dash.getCell("B20"),"RECENT HOURLY TREND");dash.mergeCells("B20:L20");
  dash.getRow(21).values=[null,"Hour","CPU Avg %","CPU Peak %","RAM Avg %","RAM Peak %","Temp Peak °C","RX Avg KB/s","TX Avg KB/s","Proc Avg","5s Samples","Root Disk %"];
  for(let c=2;c<=12;c++){const cell=dash.getCell(21,c);cell.font={bold:true,color:{argb:C.white}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:C.blue}};cell.alignment={horizontal:"center",wrapText:true};}
  hourly.slice(-12).forEach((x,i)=>{
    const row=22+i,data=[x.period,x.cpuAvg,x.cpuMax,x.ramAvg,x.ramMax,x.tempMax,x.rxAvgKB,x.txAvgKB,x.procAvg,x.samples,x.rootAvg];
    data.forEach((v,j)=>{const cell=dash.getCell(row,2+j);cell.value=v===null?"":v;if(j>0)cell.numFmt="0.00";});
    fillByRisk(dash.getCell(row,4),x.cpuMax);fillByRisk(dash.getCell(row,6),x.ramMax);fillByRisk(dash.getCell(row,12),x.rootAvg,80,90);
  });
  dash.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:1,paperSize:9};

  const summary=wb.addWorksheet("Executive Summary",{views:[{showGridLines:false}]});
  summary.columns=[{width:27},{width:33},{width:4},{width:27},{width:24},{width:18},{width:18},{width:18}];
  summary.mergeCells("A1:H1");summary.getCell("A1").value="AQUA NOVA STUDIO — EXECUTIVE SUMMARY";
  summary.getCell("A1").font={bold:true,size:20,color:{argb:C.white}};
  summary.getCell("A1").fill={type:"pattern",pattern:"solid",fgColor:{argb:C.navy}};
  summary.mergeCells("A2:H2");summary.getCell("A2").value=`${period.label} report · ${current?.serverName||SERVER_ID} · Generated ${idDate(Date.now())}`;
  section(summary.getCell("A4"),"REPORT INFORMATION");section(summary.getCell("D4"),"KEY PERFORMANCE INDICATORS");
  const info=[["Server",current?.serverName||SERVER_ID],["Hostname",current?.system?.hostname||"—"],["Requested Period",`${period.days} day(s)`],["Actual Coverage",`${idDate(coverageStart)} — ${idDate(coverageEnd)}`],["Hourly Records",rows.length],["Underlying 5s Samples",sampleTotal],["History Schema",rows.some(r=>r.schema==="hourly")?"Calendar-hour aggregate":"Legacy snapshot"]];
  info.forEach((r,i)=>{summary.getCell(`A${5+i}`).value=r[0];summary.getCell(`B${5+i}`).value=r[1];summary.getCell(`A${5+i}`).font={bold:true,color:{argb:C.muted}};});
  const kpis=[["Health Score",score,"/100"],["Avg CPU",cpuAvg,"%"],["Peak CPU",cpuPeak,"%"],["Avg RAM",ramAvg,"%"],["Peak RAM",ramPeak,"%"],["CPU Temp Peak",tempPeak,"°C"],["Current Root Disk",safeNum(rootCurrent?.usage,null),"%"]];
  kpis.forEach((r,i)=>{summary.getCell(`D${5+i}`).value=r[0];const n=safeNum(r[1],null);summary.getCell(`E${5+i}`).value=n===null?"N/A":`${n.toFixed(2)} ${r[2]}`;summary.getCell(`D${5+i}`).font={bold:true,color:{argb:C.muted}};});
  section(summary.getCell("A14"),"CAPACITY SNAPSHOT");
  const cap=[["Memory Total",fmtBytes(current?.memory?.total)],["Memory Used",fmtBytes(current?.memory?.used)],["Root Storage Total",fmtBytes(rootCurrent?.total)],["Root Storage Used",fmtBytes(rootCurrent?.used)],["Process Count",current?.processes?.total??"—"],["Uptime Seconds",current?.system?.uptime??"—"]];
  cap.forEach((r,i)=>{summary.getCell(`A${15+i}`).value=r[0];summary.getCell(`B${15+i}`).value=r[1];summary.getCell(`A${15+i}`).font={bold:true,color:{argb:C.muted}};});

  addPivotSheet(wb,"Pivot - Hourly",hourly,false);
  addPivotSheet(wb,"Pivot - Daily",aggregateDaily(rows),true);

  const telemetry=wb.addWorksheet("Telemetry",{views:[{state:"frozen",ySplit:1,showGridLines:false}]});
  const cols=[
    ["Timestamp (WIB)","timestamp",24],["Period Key","period",18],["5s Samples","samples",12],
    ["CPU Avg %","cpuAvg",12],["CPU Min %","cpuMin",12],["CPU Peak %","cpuMax",12],
    ["CPU User Avg %","cpuUserAvg",15],["CPU System Avg %","cpuSystemAvg",17],
    ["Temp Avg °C","tempAvg",13],["Temp Peak °C","tempMax",14],
    ["RAM Avg %","ramAvg",12],["RAM Min %","ramMin",12],["RAM Peak %","ramMax",12],
    ["Memory Used Avg","memoryUsedAvg",18],["Load 1m Avg","load1Avg",13],["Load 1m Peak","load1Max",14],
    ["Load 5m Avg","load5Avg",13],["Load 15m Avg","load15Avg",14],
    ["Processes Avg","procAvg",14],["Processes Peak","procMax",15],["Running Avg","runningAvg",13],["Running Peak","runningMax",14],
    ["RX Avg KB/s","rxAvgKB",13],["RX Peak KB/s","rxPeakKB",14],["RX Total MB","rxTotalMB",13],
    ["TX Avg KB/s","txAvgKB",13],["TX Peak KB/s","txPeakKB",14],["TX Total MB","txTotalMB",13],
    ["Root Disk Avg %","rootAvg",15],["Root Disk Peak %","rootMax",16],["Root Disk End %","rootEnd",15]
  ];
  telemetry.columns=cols.map(([header,key,width])=>({header,key,width}));styleHeader(telemetry.getRow(1));
  rows.forEach(r=>{
    const obj={...r,timestamp:fmtReportTime(r),period:r.period||""};
    for(const [,key] of cols){if(key==="timestamp"||key==="period")continue;if(obj[key]===null||obj[key]===undefined)obj[key]="";}
    telemetry.addRow(obj);
  });
  cols.map(x=>x[1]).filter(k=>!["timestamp","period","samples"].includes(k)).forEach(k=>telemetry.getColumn(k).numFmt="0.00");
  telemetry.getColumn("memoryUsedAvg").numFmt="#,##0";telemetry.autoFilter={from:"A1",to:"AE1"};
  telemetry.eachRow((row,idx)=>{if(idx>1&&idx%2===0)row.eachCell(c=>c.fill={type:"pattern",pattern:"solid",fgColor:{argb:C.soft}});});

  const snap=wb.addWorksheet("Current Snapshot",{views:[{showGridLines:false}]});
  snap.columns=[{width:28},{width:42},{width:28},{width:42}];
  snap.mergeCells("A1:D1");snap.getCell("A1").value="CURRENT SERVER SNAPSHOT";
  snap.getCell("A1").font={bold:true,size:18,color:{argb:C.white}};snap.getCell("A1").fill={type:"pattern",pattern:"solid",fgColor:{argb:C.navy}};
  const snapshotRows=[
    ["Server",current?.serverName||SERVER_ID,"Hostname",current?.system?.hostname||"—"],
    ["Kernel",current?.system?.kernel||"—","Architecture",current?.system?.architecture||"—"],
    ["CPU Model",current?.cpu?.brand||current?.cpu?.model||"—","CPU Cores",`${current?.cpu?.physicalCores??"—"} physical / ${current?.cpu?.logicalCores??"—"} logical`],
    ["CPU Usage",pct(current?.cpu?.usage),"CPU Temp",current?.cpu?.temperature==null?"—":`${current.cpu.temperature} °C`],
    ["RAM Usage",pct(current?.memory?.usage),"RAM Used",fmtBytes(current?.memory?.used)],
    ["Root Disk",pct(rootCurrent?.usage),"Processes",current?.processes?.total??"—"],
    ["Uptime",current?.system?.uptime??"—","Last Heartbeat",idDate(current?.heartbeat||current?.timestamp)]
  ];
  snapshotRows.forEach((r,i)=>{const row=3+i;[1,2,3,4].forEach(c=>snap.getCell(row,c).value=r[c-1]);snap.getCell(row,1).font={bold:true,color:{argb:C.muted}};snap.getCell(row,3).font={bold:true,color:{argb:C.muted}};});
  borderRange(snap,`A3:D${2+snapshotRows.length}`);

  const raw=wb.addWorksheet("Raw Snapshot",{views:[{showGridLines:false}]});
  raw.getCell("A1").value="Current Firebase Snapshot (JSON)";raw.getCell("A1").font={bold:true,size:14,color:{argb:C.blue}};
  raw.getCell("A3").value=JSON.stringify(current||{},null,2);raw.getCell("A3").alignment={wrapText:true,vertical:"top"};raw.getColumn("A").width=120;

  const readme=wb.addWorksheet("Report Guide",{views:[{showGridLines:false}]});
  readme.columns=[{width:30},{width:100}];readme.getCell("A1").value="REPORT GUIDE";readme.getCell("A1").font={bold:true,size:18,color:{argb:C.blue}};
  const guide=[
    ["History Model","Realtime current remains 5 seconds. Persistent history is one calendar-hour aggregate."],
    ["Timezone","All human-readable report timestamps are explicitly rendered in Asia/Jakarta (WIB)."],
    ["Dashboard","KPI dashboard uses weighted AVG and stored Peak/Max from hourly history."],
    ["Pivot - Hourly","Direct view of each Firebase hourly aggregate. Stored peaks are preserved."],
    ["Pivot - Daily","AVG is weighted by underlying sample count; Peak uses MAX; traffic totals use SUM."],
    ["Telemetry","Hourly analytical dataset with AVG/MIN/PEAK/TOTAL fields. Missing collector fields are blank, not 0."],
    ["Current Snapshot","Latest realtime server state, including current root disk."],
    ["Important","CPU User/System, Load 5m/15m, Running Processes, and historical Root Disk require the collector to store those fields in hourly history. If absent in Firebase, the report intentionally shows blank/N/A."],
    ["Compatibility","Legacy snapshot history remains supported automatically."]
  ];
  guide.forEach((r,i)=>{readme.getCell(`A${3+i}`).value=r[0];readme.getCell(`B${3+i}`).value=r[1];readme.getCell(`A${3+i}`).font={bold:true,color:{argb:C.muted}};readme.getCell(`B${3+i}`).alignment={wrapText:true,vertical:"top"};});
  return wb;
}

async function downloadReport(type,button){
  const period=periods[type];if(!period)return;
  const status=$("reportStatus"),oldText=button.textContent;
  button.disabled=true;button.textContent="Generating...";
  status.className="report-status";status.textContent=`Loading ${period.label.toLowerCase()} hourly history from Firebase...`;
  try{
    const now=Date.now(),from=now-period.days*86400000;
    const histQuery=query(ref(db,`servers/${SERVER_ID}/history`),orderByChild("timestamp"),startAt(from),endAt(now));
    const [histSnap,currentSnap]=await Promise.all([get(histQuery),get(ref(db,`servers/${SERVER_ID}/current`))]);
    const rawRows=flattenHistory(histSnap.val()),current=currentSnap.val()||{};
    if(!rawRows.length)throw new Error("Tidak ada historical data untuk periode ini.");
    const sampleTotal=normalizeRows(rawRows).reduce((a,r)=>a+nz(r.samples),0);
    status.textContent=`Building report from ${rawRows.length.toLocaleString("id-ID")} hourly record(s) / ${sampleTotal.toLocaleString("id-ID")} underlying sample(s)...`;
    const wb=await buildWorkbook(period,rawRows,current),buffer=await wb.xlsx.writeBuffer();
    const blob=new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=`${period.label}_Report_${jakartaDateStamp()}.xlsx`;
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    status.className="report-status success";status.textContent=`Professional ${period.label.toLowerCase()} report selesai dari ${rawRows.length.toLocaleString("id-ID")} hourly record(s).`;
    toast(`${period.label} professional report berhasil dibuat`);
  }catch(e){
    console.error(e);status.className="report-status error";status.textContent=e.message||"Gagal membuat report.";
  }finally{
    button.disabled=false;button.textContent=oldText;
  }
}

export function initReports(){
  document.querySelectorAll(".report-button").forEach(button=>button.addEventListener("click",()=>downloadReport(button.dataset.report,button)));
}
