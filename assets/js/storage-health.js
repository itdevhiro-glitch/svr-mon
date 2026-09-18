import { ref, onValue, off } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { db, SERVER_ID } from "./firebase-config.js";

let healthRef = null;
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bytes = n => { n=Number(n); if(!Number.isFinite(n)) return '—'; const u=['B','KB','MB','GB','TB']; let i=0; while(n>=1024&&i<u.length-1){n/=1024;i++;} return `${n.toFixed(i?1:0)} ${u[i]}`; };
const statusLabel = s => String(s||'unknown').replaceAll('_',' ').toUpperCase();

function render(data={}) {
  const summary=data.summary||{}; const drives=Object.values(data.drives||{});
  if ($('storageHealthState')) { $('storageHealthState').textContent = data.available===false?'UNAVAILABLE':'LIVE'; $('storageHealthState').classList.toggle('online',data.available!==false); }
  const set=(id,v)=>{if($(id))$(id).textContent=v};
  set('shDriveCount', summary.totalDrives ?? drives.length);
  set('shHealthyCount', summary.healthy ?? drives.filter(d=>d.healthStatus==='healthy').length);
  set('shWarningCount', summary.warning ?? drives.filter(d=>d.healthStatus==='warning').length);
  set('shCriticalCount', summary.critical ?? drives.filter(d=>d.healthStatus==='critical').length);
  set('shLastCheck', data.checkedAt ? new Date(data.checkedAt).toLocaleString('id-ID') : '—');
  const box=$('storageDriveGrid'); if(!box)return;
  if(!drives.length){ box.innerHTML='<div class="empty-state large-empty"><b>No physical drive telemetry.</b><span>Install smartmontools and update the ANASTUDIO collector.</span></div>'; return; }
  box.innerHTML=drives.map(d=>{
    const st=d.healthStatus||'unknown'; const smart=d.smartPassed===true?'PASSED':d.smartPassed===false?'FAILED':'N/A';
    const mounts=(d.mounts||[]).map(m=>`<span>${esc(m.mount)} · ${esc(m.fsType||'')}</span>`).join('')||'<span>No mounted filesystem mapped</span>';
    return `<article class="panel drive-health-card status-${esc(st)}">
      <div class="drive-health-head"><div><p class="panel-kicker">${esc((d.type||'DRIVE').toUpperCase())} · ${esc(d.device||'')}</p><h3>${esc(d.model||d.name||'Physical Drive')}</h3><small>${esc(d.serial||d.wwn||'No serial reported')}</small></div><span class="drive-health-status ${esc(st)}">${esc(statusLabel(st))}</span></div>
      <div class="drive-health-metrics"><div><span>CAPACITY</span><b>${bytes(d.size)}</b></div><div><span>SMART</span><b>${smart}</b></div><div><span>TEMPERATURE</span><b>${d.temperature==null?'—':esc(d.temperature)+'°C'}</b></div><div><span>POWER ON</span><b>${d.powerOnHours==null?'—':esc(d.powerOnHours)+' h'}</b></div></div>
      <div class="sector-health"><div><span>Reallocated</span><b>${esc(d.reallocatedSectors ?? '—')}</b></div><div><span>Pending</span><b>${esc(d.pendingSectors ?? '—')}</b></div><div><span>Uncorrectable</span><b>${esc(d.uncorrectableSectors ?? '—')}</b></div></div>
      <div class="drive-mounts"><span>FILESYSTEM / MOUNTS</span>${mounts}</div>
      ${d.smartError?`<div class="drive-health-note">SMART: ${esc(d.smartError)}</div>`:''}
    </article>`;
  }).join('');
}

export function initStorageHealth(){ stopStorageHealth(); healthRef=ref(db,`servers/${SERVER_ID}/current/storageHealth`); onValue(healthRef,s=>render(s.val()||{available:false}),e=>{console.error('[STORAGE HEALTH]',e);render({available:false});}); }
export function stopStorageHealth(){ if(healthRef){off(healthRef);healthRef=null;} }
