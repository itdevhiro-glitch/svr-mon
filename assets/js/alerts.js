const ALERT_API_BASE = "https://172.24.28.36/api/alerts";
let timer = null;
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when = (v) => { const n=Number(v); return n ? new Date(n).toLocaleString('id-ID') : '—'; };
const sevLabel = (v) => v === 'very_critical' ? 'VERY CRITICAL' : String(v || 'info').toUpperCase();

async function getJson(path, params={}) {
  const url = new URL(ALERT_API_BASE + path);
  Object.entries(params).forEach(([k,v]) => { if (v !== '' && v != null) url.searchParams.set(k,v); });
  const r = await fetch(url, { method:'GET', mode:'cors', cache:'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
function setCounts(s={}) {
  const w=Number(s.warning)||0, c=Number(s.critical)||0, v=Number(s.veryCritical)||0, total=Number(s.total)||(w+c+v);
  $('warningCount').textContent=w; $('criticalCount').textContent=c; $('veryCriticalCount').textContent=v;
  $('alertBellCount').textContent=total;
  document.querySelector('.nav-alert-badge')?.replaceChildren(document.createTextNode(String(total)));
}
function renderQueue(active=[]) {
  $('activeIncidentCount').textContent=`${active.length} active`;
  if (!active.length) { $('alertQueue').innerHTML='<div class="empty-state large-empty"><b>No active incidents.</b><span>ANASTUDIO currently has no unresolved alerts.</span></div>'; return; }
  $('alertQueue').innerHTML=active.map(x=>`<div class="incident-row severity-${esc(x.severity)}"><div class="incident-severity">${esc(sevLabel(x.severity))}</div><div class="incident-main"><strong>${esc(x.title)}</strong><span>${esc(x.message)}</span><small>${esc(x.source)} · detected ${esc(when(x.detectedAt))}</small></div><div class="incident-status">ACTIVE</div></div>`).join('');
}
function renderEvents(events=[]) {
  $('logResultCount').textContent=`${events.length} events`;
  if (!events.length) { $('alertLogResults').innerHTML='<div class="empty-state large-empty"><b>No matching events.</b><span>Try another severity, source, or search term.</span></div>'; return; }
  $('alertLogResults').innerHTML=`<div class="table-scroll"><table class="alert-log-table"><thead><tr><th>Time</th><th>State</th><th>Severity</th><th>Source</th><th>Event</th><th>Value</th></tr></thead><tbody>${events.map(x=>`<tr><td>${esc(when(x.resolvedAt||x.lastSeenAt||x.detectedAt))}</td><td><span class="event-state ${esc(x.type)}">${esc(String(x.type||'event').toUpperCase())}</span></td><td><span class="event-severity severity-${esc(x.severity)}">${esc(sevLabel(x.severity))}</span></td><td>${esc(String(x.source||'—').toUpperCase())}</td><td><strong>${esc(x.title)}</strong><small>${esc(x.message)}</small></td><td>${x.value==null?'—':esc(x.value)}</td></tr>`).join('')}</tbody></table></div>`;
}
async function loadCurrent() {
  const data=await getJson('/current'); setCounts(data.summary); renderQueue(Array.isArray(data.active)?data.active:[]);
  const badge=$('alertBackendState'); badge.textContent='ALERT ENGINE ONLINE'; badge.classList.remove('offline'); badge.classList.add('online');
}
async function loadEvents() {
  const data=await getJson('/events',{severity:$('alertSeverity')?.value||'all',source:$('alertSource')?.value||'all',search:$('alertSearch')?.value?.trim()||'',limit:$('alertLimit')?.value||100});
  renderEvents(Array.isArray(data.events)?data.events:[]);
}
async function refresh() {
  try { await Promise.all([loadCurrent(),loadEvents()]); }
  catch(e) { const badge=$('alertBackendState'); if(badge){badge.textContent='ALERT ENGINE UNREACHABLE';badge.classList.remove('online');badge.classList.add('offline');} console.error('[ALERTS]',e); }
}
export function initAlertsCenter(){
  $('alertLogForm')?.addEventListener('submit',e=>{e.preventDefault();loadEvents().catch(console.error)});
  refresh(); if(timer) clearInterval(timer); timer=setInterval(()=>loadCurrent().catch(()=>{}),5000);
}
export function stopAlertsCenter(){ if(timer){clearInterval(timer);timer=null;} }
