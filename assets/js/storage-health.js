import { ref, onValue, off } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { db, SERVER_ID } from "./firebase-config.js";

let healthRef = null;
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const bytes = n => { n=Number(n); if(!Number.isFinite(n)) return '—'; const u=['B','KB','MB','GB','TB']; let i=0; while(n>=1024&&i<u.length-1){n/=1024;i++;} return `${n.toFixed(i?1:0)} ${u[i]}`; };
const statusLabel = s => String(s||'unknown').replaceAll('_',' ').toUpperCase();

function normalizeDrive(raw={}) {
  const smart=raw.smart||{}, identity=raw.identity||{}, hw=raw.hardware||{}, health=raw.health||{};
  return {
    ...raw,
    model: identity.model ?? raw.model ?? raw.name ?? 'Physical Drive',
    family: identity.family ?? raw.family ?? '',
    serial: identity.serial ?? raw.serial ?? '',
    wwn: identity.wwn ?? raw.wwn ?? '',
    firmware: identity.firmware ?? raw.firmware ?? '',
    type: hw.type ?? raw.type ?? 'DRIVE',
    transport: hw.transport ?? raw.transport ?? '',
    size: hw.capacity ?? raw.size,
    smartPassed: smart.passed ?? raw.smartPassed,
    smartAvailable: smart.available ?? raw.smartAvailable,
    smartError: smart.error ?? raw.smartError,
    temperature: smart.temperature ?? raw.temperature,
    powerOnHours: smart.powerOnHours ?? raw.powerOnHours,
    reallocatedSectors: smart.reallocatedSectors ?? raw.reallocatedSectors ?? 0,
    pendingSectors: smart.pendingSectors ?? raw.pendingSectors ?? 0,
    uncorrectableSectors: smart.offlineUncorrectable ?? raw.uncorrectableSectors ?? raw.offlineUncorrectable ?? 0,
    crcErrors: smart.crcErrors ?? raw.crcErrors ?? 0,
    nvme: smart.nvme ?? raw.nvme ?? null,
    healthStatus: health.status ?? raw.healthStatus ?? 'unknown',
    healthReasons: Array.isArray(health.reasons) ? health.reasons : (raw.healthReasons||[]),
    filesystems: Array.isArray(raw.filesystems) ? raw.filesystems : [],
    mounts: Array.isArray(raw.mounts) ? raw.mounts : []
  };
}

function diagnostics(d) {
  const issues=[];
  const add=(severity,title,meaning,risk,actions,code)=>issues.push({severity,title,meaning,risk,actions,code});
  const pending=num(d.pendingSectors), realloc=num(d.reallocatedSectors), unc=num(d.uncorrectableSectors), crc=num(d.crcErrors), temp=num(d.temperature);

  if (d.smartPassed === false) add('critical','SMART overall health failed','The drive firmware reports that its overall SMART health check has failed.','High risk of drive degradation or failure. Continued operation can increase the chance of data loss.',['Protect important data as soon as practical.','Reduce non-essential disk workload.','Prepare a replacement drive and migration plan.','Replace the drive rather than relying on a dashboard “fix”.'],'SMART_FAILED');
  if (unc > 0) add('critical',`${unc} uncorrectable sector${unc===1?'':'s'} detected`,'One or more sectors could not be corrected during offline SMART processing.','Affected data may be unreadable. Additional media errors can indicate worsening physical damage.',['Protect readable important data.','Avoid stress tests or unnecessary full-disk scans.','Review kernel logs for I/O or UNC errors.','Plan drive replacement promptly.'],'UNCORRECTABLE');
  if (pending > 0) add('warning',`${pending} pending sector${pending===1?'':'s'} detected`,'These sectors were unstable or unreadable and are waiting for the drive to re-evaluate or remap them.','Reads can fail on affected areas. If the count grows or I/O errors recur, the media is deteriorating.',['Prioritize important data protection.','Avoid heavy or unnecessary disk I/O for now.','Monitor whether Current Pending Sector increases.','Check kernel logs for new I/O / UNC errors.','Prepare a replacement HDD if the count grows or read errors recur.'],'PENDING_SECTORS');
  if (realloc > 0) add('warning',`${realloc} reallocated sector${realloc===1?'':'s'}`,'The drive has already remapped failed sectors to spare physical sectors.','A stable count can remain usable, but a rising count indicates continuing media degradation.',['Record the current value as a baseline.','Monitor whether the reallocated count increases.','Protect important data and plan replacement if the count continues to rise.'],'REALLOCATED');
  if (crc > 0) add('warning',`${crc} interface CRC error${crc===1?'':'s'}`,'CRC errors usually indicate communication problems between the drive and SATA controller rather than damaged disk media.','A bad SATA cable, connector, power connection, or electrical interference can cause transfer errors.',['Power down safely before touching hardware.','Reseat the SATA data and power connectors.','Inspect or replace the SATA cable if errors continue.','Monitor whether the CRC counter keeps increasing.'],'CRC');
  if (temp >= 60) add('critical',`Drive temperature is ${temp}°C`,'The current drive temperature is above the dashboard critical threshold.','Sustained excessive heat can reduce reliability and accelerate hardware wear.',['Reduce non-essential disk workload.','Check case airflow and fan operation.','Clean dust and verify the drive is not heat-soaked by nearby components.','Recheck temperature after cooling improvements.'],'TEMP_CRITICAL');
  else if (temp >= 50) add('warning',`Drive temperature is elevated at ${temp}°C`,'The current temperature is above the dashboard warning threshold.','Prolonged elevated temperature can reduce storage reliability.',['Check airflow around the drive.','Inspect fan operation and dust buildup.','Monitor temperature under normal workload.'],'TEMP_WARNING');

  const nv=d.nvme||{};
  if (num(nv.criticalWarning)>0) add('critical',`NVMe critical warning ${num(nv.criticalWarning)}`,'The NVMe controller has raised a critical SMART warning.','The warning can represent reliability, spare-capacity, temperature, or media state problems.',['Protect important data.','Review the NVMe SMART details.','Prepare replacement if the warning persists.'],'NVME_CRITICAL');
  if (num(nv.mediaErrors)>0) add('critical',`${num(nv.mediaErrors)} NVMe media error${num(nv.mediaErrors)===1?'':'s'}`,'The NVMe device reports media/data-integrity errors.','Media errors can make data unreadable and may indicate device degradation.',['Protect important data.','Avoid unnecessary write-heavy testing.','Plan replacement if media errors persist or increase.'],'NVME_MEDIA');
  if (num(nv.percentageUsed)>=90) add('warning',`NVMe endurance used ${num(nv.percentageUsed)}%`,'The NVMe endurance indicator is near the dashboard end-of-life threshold.','Remaining write endurance is limited compared with a new device.',['Plan a replacement window.','Reduce avoidable write-heavy workloads.','Continue monitoring endurance and media errors.'],'NVME_ENDURANCE');

  if (!d.smartAvailable) add('unknown','SMART telemetry unavailable','The dashboard cannot read SMART health information for this physical drive.','The drive may still be operational, but hardware health cannot be assessed from SMART.',['Confirm smartmontools supports this device.','Verify collector permissions for smartctl.','Check the collector log for the SMART error.'],'SMART_UNAVAILABLE');
  return issues;
}

function mountsHtml(d){
  const fs=[];
  for(const f of d.filesystems||[]) for(const m of f.mountpoints||[]) fs.push(`<span>${esc(f.device||d.device)} · ${esc(f.filesystem||'unknown')} · ${esc(m)}</span>`);
  if(!fs.length) for(const m of d.mounts||[]) fs.push(`<span>${esc(m.mount||m)}${m.fsType?` · ${esc(m.fsType)}`:''}</span>`);
  return fs.join('') || '<span>No mounted filesystem mapped</span>';
}

function issueHtml(issue,index){
  return `<article class="sh-diagnostic-item ${esc(issue.severity)}">
    <div class="sh-diagnostic-top"><div class="sh-diagnostic-icon">${issue.severity==='critical'?'!':'⚠'}</div><div><span class="sh-diagnostic-code">${esc(issue.code)}</span><h4>${esc(issue.title)}</h4></div><span class="sh-priority ${esc(issue.severity)}">${issue.severity==='critical'?'IMMEDIATE ACTION':'ACTION REQUIRED'}</span></div>
    <div class="sh-diagnostic-explain"><div><span>WHAT THIS MEANS</span><p>${esc(issue.meaning)}</p></div><div><span>RISK / IMPACT</span><p>${esc(issue.risk)}</p></div></div>
    <div class="sh-action-plan"><span>RECOMMENDED ACTION PLAN</span><ol>${issue.actions.map(a=>`<li><b>${String(index+1).padStart(2,'0')}.${String(issue.actions.indexOf(a)+1).padStart(2,'0')}</b><span>${esc(a)}</span></li>`).join('')}</ol></div>
  </article>`;
}

function presentationHtml(drives, overall){
  if(!drives.length) return '';
  const issueCount=drives.reduce((n,d)=>n+diagnostics(d).length,0);
  const primary=drives.find(d=>d.healthStatus==='critical')||drives.find(d=>d.healthStatus==='warning')||drives[0];
  const findings=drives.flatMap((d,i)=>diagnostics(d).map(x=>({...x,drive:d,index:i})));
  const topFinding=findings[0];
  return `<article class="panel sh-presentation status-${esc(overall)}">
    <div class="sh-presentation-head"><div><p class="panel-kicker">HEALTH PRESENTATION</p><h3>Storage Condition & Response</h3><p>Translates SMART telemetry into operational findings, risk context and concrete administrator actions.</p></div><div class="sh-overall-badge ${esc(overall)}"><span>OVERALL CONDITION</span><strong>${esc(statusLabel(overall))}</strong><small>${issueCount} active finding${issueCount===1?'':'s'}</small></div></div>
    <div class="sh-presentation-grid">
      <div class="sh-condition-visual ${esc(overall)}"><div class="sh-health-ring"><div><span>${overall==='healthy'?'✓':'!'}</span><b>${esc(statusLabel(overall))}</b><small>${esc(primary.device||'PHYSICAL STORAGE')}</small></div></div><div class="sh-drive-focus"><span>PRIORITY DRIVE</span><h4>${esc(primary.model)}</h4><p>${esc(primary.device)} · ${esc(primary.type)} · ${bytes(primary.size)}</p><div class="sh-focus-stats"><div><span>SMART</span><b>${primary.smartPassed===true?'PASSED':primary.smartPassed===false?'FAILED':'N/A'}</b></div><div><span>TEMP</span><b>${primary.temperature==null?'—':esc(primary.temperature)+'°C'}</b></div><div><span>PENDING</span><b>${esc(primary.pendingSectors)}</b></div></div></div></div>
      <div class="sh-current-finding"><span class="sh-block-label">CURRENT HEALTH FINDING</span>${topFinding?`<div class="sh-finding-title ${esc(topFinding.severity)}"><b>${topFinding.severity==='critical'?'CRITICAL':'WARNING'}</b><h4>${esc(topFinding.title)}</h4></div><p>${esc(topFinding.meaning)}</p><div class="sh-next-action"><span>NEXT ADMIN ACTION</span><b>${esc(topFinding.actions[0])}</b></div>`:`<div class="sh-all-clear"><b>No active storage-health finding</b><span>Current SMART metrics are within the dashboard policy thresholds.</span></div>`}</div>
    </div>
  </article>`;
}

function render(data={}) {
  const summary=data.summary||{};
  const drives=Object.values(data.drives||{}).map(normalizeDrive);
  if ($('storageHealthState')) { $('storageHealthState').textContent = data.available===false?'UNAVAILABLE':'LIVE'; $('storageHealthState').classList.toggle('online',data.available!==false); }
  const set=(id,v)=>{if($(id))$(id).textContent=v};
  set('shDriveCount', summary.total ?? summary.totalDrives ?? drives.length);
  set('shHealthyCount', summary.healthy ?? drives.filter(d=>d.healthStatus==='healthy').length);
  set('shWarningCount', summary.warning ?? drives.filter(d=>d.healthStatus==='warning').length);
  set('shCriticalCount', summary.critical ?? drives.filter(d=>d.healthStatus==='critical').length);
  set('shLastCheck', data.checkedAt ? new Date(data.checkedAt).toLocaleString('id-ID') : '—');

  const overall=data.status || (drives.some(d=>d.healthStatus==='critical')?'critical':drives.some(d=>d.healthStatus==='warning')?'warning':drives.length?'healthy':'unknown');
  const pres=$('storageHealthPresentation'); if(pres) pres.innerHTML=presentationHtml(drives,overall);

  const diag=$('storageDiagnosticCenter');
  if(diag){
    const all=drives.flatMap((d,i)=>diagnostics(d).map(x=>({...x,drive:d,driveIndex:i})));
    diag.innerHTML=all.length ? `<div class="sh-diagnostic-header"><div><p class="panel-kicker">DIAGNOSTIC & REMEDIATION</p><h3>Health Findings & Recommended Actions</h3><p>Actions are guidance for administrators. Hardware/media faults are not automatically “fixed” by the dashboard.</p></div><span>${all.length} FINDING${all.length===1?'':'S'}</span></div>${all.map((x,i)=>`<div class="sh-diagnostic-drive"><span>${esc(x.drive.device)} · ${esc(x.drive.model)}</span></div>${issueHtml(x,i)}`).join('')}` : `<div class="sh-all-clear large"><b>✓ No remediation required</b><span>No active SMART or thermal finding is currently above the dashboard thresholds.</span></div>`;
  }

  const box=$('storageDriveGrid'); if(!box)return;
  if(!drives.length){ box.innerHTML='<div class="empty-state large-empty"><b>No physical drive telemetry.</b><span>Install smartmontools and update the ANASTUDIO collector.</span></div>'; return; }
  box.innerHTML=drives.map(d=>{
    const st=d.healthStatus||'unknown'; const smart=d.smartPassed===true?'PASSED':d.smartPassed===false?'FAILED':'N/A';
    return `<article class="panel drive-health-card status-${esc(st)}">
      <div class="drive-health-head"><div><p class="panel-kicker">${esc(String(d.type||'DRIVE').toUpperCase())} · ${esc(d.device||'')}</p><h3>${esc(d.model)}</h3><small>${esc(d.serial||d.wwn||'No serial reported')}</small></div><span class="drive-health-status ${esc(st)}">${esc(statusLabel(st))}</span></div>
      <div class="drive-health-metrics"><div><span>CAPACITY</span><b>${bytes(d.size)}</b></div><div><span>SMART</span><b>${smart}</b></div><div><span>TEMPERATURE</span><b>${d.temperature==null?'—':esc(d.temperature)+'°C'}</b></div><div><span>POWER ON</span><b>${d.powerOnHours==null?'—':esc(d.powerOnHours)+' h'}</b></div></div>
      <div class="sector-health"><div class="${num(d.reallocatedSectors)>0?'metric-warning':''}"><span>Reallocated</span><b>${esc(d.reallocatedSectors)}</b><small>${num(d.reallocatedSectors)>0?'Monitor trend':'Normal'}</small></div><div class="${num(d.pendingSectors)>0?'metric-warning':''}"><span>Pending</span><b>${esc(d.pendingSectors)}</b><small>${num(d.pendingSectors)>0?'Needs attention':'Normal'}</small></div><div class="${num(d.uncorrectableSectors)>0?'metric-critical':''}"><span>Uncorrectable</span><b>${esc(d.uncorrectableSectors)}</b><small>${num(d.uncorrectableSectors)>0?'High risk':'Normal'}</small></div><div class="${num(d.crcErrors)>0?'metric-warning':''}"><span>CRC Errors</span><b>${esc(d.crcErrors)}</b><small>${num(d.crcErrors)>0?'Check connection':'Normal'}</small></div></div>
      <div class="drive-mounts"><span>FILESYSTEM / MOUNTS</span>${mountsHtml(d)}</div>
      ${d.healthReasons.length?`<div class="drive-health-note"><b>Health reason</b>${d.healthReasons.map(r=>`<span>${esc(r)}</span>`).join('')}</div>`:''}
      ${d.smartError?`<div class="drive-health-note">SMART: ${esc(d.smartError)}</div>`:''}
    </article>`;
  }).join('');
}

export function initStorageHealth(){ stopStorageHealth(); healthRef=ref(db,`servers/${SERVER_ID}/current/storageHealth`); onValue(healthRef,s=>render(s.val()||{available:false}),e=>{console.error('[STORAGE HEALTH]',e);render({available:false});}); }
export function stopStorageHealth(){ if(healthRef){off(healthRef);healthRef=null;} }
