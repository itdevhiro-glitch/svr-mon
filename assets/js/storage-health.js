import { ref, onValue, off } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { db, SERVER_ID } from "./firebase-config.js";

let healthRef = null;
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => { const n=Number(v); return Number.isFinite(n)?n:null; };
const bytes = n => { n=Number(n); if(!Number.isFinite(n)) return '—'; const u=['B','KB','MB','GB','TB']; let i=0; while(n>=1024&&i<u.length-1){n/=1024;i++;} return `${n.toFixed(i?1:0)} ${u[i]}`; };
const statusLabel = s => String(s||'unknown').replaceAll('_',' ').toUpperCase();
const value = (v, suffix='') => v===null || v===undefined || v==='' ? '—' : `${esc(v)}${suffix}`;

function normalizeDrive(d={}) {
  const identity=d.identity||{};
  const hardware=d.hardware||{};
  const smart=d.smart||{};
  const health=d.health||{};
  const filesystems=Array.isArray(d.filesystems)?d.filesystems:[];

  return {
    id:d.id||identity.serial||identity.wwn||d.device||d.name||'drive',
    device:d.device||'',
    name:d.name||'',
    model:identity.model||d.model||d.name||'Physical Drive',
    family:identity.family||d.family||'',
    serial:identity.serial||d.serial||'',
    wwn:identity.wwn||d.wwn||'',
    firmware:identity.firmware||d.firmware||'',
    type:hardware.type||d.type||'DRIVE',
    transport:hardware.transport||d.transport||'',
    rotational:hardware.rotational ?? d.rotational,
    size:hardware.capacity ?? d.size,
    smartAvailable:smart.available ?? d.smartAvailable,
    smartPassed:smart.passed ?? d.smartPassed,
    smartError:smart.error||d.smartError||'',
    temperature:smart.temperature ?? d.temperature,
    powerOnHours:smart.powerOnHours ?? d.powerOnHours,
    reallocatedSectors:smart.reallocatedSectors ?? d.reallocatedSectors,
    pendingSectors:smart.pendingSectors ?? d.pendingSectors,
    uncorrectableSectors:smart.offlineUncorrectable ?? d.uncorrectableSectors,
    crcErrors:smart.crcErrors ?? d.crcErrors,
    nvme:smart.nvme||d.nvme||null,
    healthStatus:health.status||d.healthStatus||'unknown',
    reasons:Array.isArray(health.reasons)?health.reasons:(Array.isArray(d.reasons)?d.reasons:[]),
    filesystems,
    mounts:Array.isArray(d.mounts)?d.mounts:[]
  };
}

function renderMounts(d) {
  const rows=[];
  for (const fs of d.filesystems) {
    const mps=Array.isArray(fs.mountpoints)?fs.mountpoints.filter(Boolean):[];
    if (mps.length) {
      for (const mount of mps) rows.push({device:fs.device||'', fs:fs.filesystem||'', mount});
    } else if (fs.device || fs.filesystem) rows.push({device:fs.device||'', fs:fs.filesystem||'', mount:'Not mounted'});
  }
  for (const m of d.mounts) rows.push({device:m.device||'',fs:m.fsType||'',mount:m.mount||''});
  if(!rows.length) return '<div class="drive-mount-empty">No mounted filesystem mapped</div>';
  return rows.map(m=>`<div class="drive-mount-row"><code>${esc(m.device||'—')}</code><span>${esc(m.fs||'—')}</span><b>${esc(m.mount||'—')}</b></div>`).join('');
}

function render(data={}) {
  const summary=data.summary||{};
  const rawDrives=Array.isArray(data.drives)?data.drives:Object.values(data.drives||{});
  const drives=rawDrives.map(normalizeDrive);
  const available=data.available!==false;
  const overall=String(data.status||'unknown').toLowerCase();

  if ($('storageHealthState')) {
    const el=$('storageHealthState');
    el.textContent=!available?'UNAVAILABLE':statusLabel(overall==='unknown'?'live':overall);
    el.className=`backend-state storage-state ${available?'online':''} state-${esc(overall)}`;
  }

  const set=(id,v)=>{if($(id))$(id).textContent=v};
  set('shDriveCount', summary.total ?? summary.totalDrives ?? drives.length);
  set('shHealthyCount', summary.healthy ?? drives.filter(d=>d.healthStatus==='healthy').length);
  set('shWarningCount', summary.warning ?? drives.filter(d=>d.healthStatus==='warning').length);
  set('shCriticalCount', summary.critical ?? drives.filter(d=>d.healthStatus==='critical').length);
  set('shLastCheck', data.checkedAt ? new Date(data.checkedAt).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'medium'}) : '—');

  const box=$('storageDriveGrid'); if(!box)return;
  if(!drives.length){
    box.innerHTML='<div class="empty-state large-empty"><b>No physical drive telemetry.</b><span>The collector is online, but no physical SMART-capable drive was reported.</span></div>';
    return;
  }

  box.innerHTML=drives.map(d=>{
    const st=d.healthStatus;
    const smart=d.smartPassed===true?'PASSED':d.smartPassed===false?'FAILED':d.smartAvailable===false?'UNAVAILABLE':'N/A';
    const reasons=d.reasons.length?d.reasons.map(r=>`<li>${esc(r)}</li>`).join(''):'<li>No SMART health warnings reported.</li>';
    const temp=num(d.temperature);
    const pending=num(d.pendingSectors);
    const realloc=num(d.reallocatedSectors);
    const uncorr=num(d.uncorrectableSectors);
    const crc=num(d.crcErrors);
    const identityMeta=[d.family,d.transport?d.transport.toUpperCase():'',d.firmware?`FW ${d.firmware}`:''].filter(Boolean).join(' · ');

    return `<article class="panel drive-health-card status-${esc(st)}">
      <div class="drive-health-head">
        <div class="drive-title-wrap">
          <div class="drive-icon">${esc(d.type==='HDD'?'HDD':d.type==='NVMe'?'NV':'SSD')}</div>
          <div><p class="panel-kicker">PHYSICAL DRIVE · ${esc(d.device||'—')}</p><h3>${esc(d.model)}</h3><small>${esc(d.serial||d.wwn||'No serial reported')}</small></div>
        </div>
        <span class="drive-health-status ${esc(st)}">${esc(statusLabel(st))}</span>
      </div>

      ${identityMeta?`<div class="drive-identity-meta">${esc(identityMeta)}</div>`:''}

      <div class="drive-health-metrics">
        <div><span>CAPACITY</span><b>${bytes(d.size)}</b><small>${esc(d.type||'DRIVE')}</small></div>
        <div><span>SMART</span><b class="metric-${d.smartPassed===false?'bad':d.smartPassed===true?'good':'neutral'}">${smart}</b><small>${d.smartAvailable===false?'Telemetry unavailable':'Self-assessment'}</small></div>
        <div><span>TEMPERATURE</span><b>${temp===null?'—':esc(temp)+'°C'}</b><small>${temp!==null&&temp>=50?'Elevated':'Current sensor'}</small></div>
        <div><span>POWER ON</span><b>${value(d.powerOnHours,' h')}</b><small>Lifetime hours</small></div>
      </div>

      <div class="sector-health">
        <div class="${realloc>0?'sector-warn':''}"><span>Reallocated</span><b>${value(d.reallocatedSectors)}</b><small>SMART ID 5</small></div>
        <div class="${pending>0?'sector-warn':''}"><span>Pending</span><b>${value(d.pendingSectors)}</b><small>SMART ID 197</small></div>
        <div class="${uncorr>0?'sector-bad':''}"><span>Uncorrectable</span><b>${value(d.uncorrectableSectors)}</b><small>SMART ID 198</small></div>
        <div class="${crc>0?'sector-warn':''}"><span>CRC Errors</span><b>${value(d.crcErrors)}</b><small>SMART ID 199</small></div>
      </div>

      <div class="drive-detail-grid">
        <section class="drive-subpanel"><div class="drive-subtitle"><span>FILESYSTEM / MOUNTS</span><b>${d.filesystems.length || d.mounts.length} mapped</b></div>${renderMounts(d)}</section>
        <section class="drive-subpanel"><div class="drive-subtitle"><span>HEALTH ANALYSIS</span><b>${esc(statusLabel(st))}</b></div><ul class="drive-reasons">${reasons}</ul></section>
      </div>

      ${d.smartError?`<div class="drive-health-note"><b>SMART telemetry note</b><span>${esc(d.smartError)}</span></div>`:''}
    </article>`;
  }).join('');
}

export function initStorageHealth(){
  stopStorageHealth();
  healthRef=ref(db,`servers/${SERVER_ID}/current/storageHealth`);
  onValue(healthRef,s=>render(s.val()||{available:false}),e=>{console.error('[STORAGE HEALTH]',e);render({available:false});});
}
export function stopStorageHealth(){ if(healthRef){off(healthRef);healthRef=null;} }
