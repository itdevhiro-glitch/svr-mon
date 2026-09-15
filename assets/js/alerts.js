import { ref, onValue, off, get, query, limitToLast } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { db, SERVER_ID } from "./firebase-config.js";

const CURRENT_PATH = `servers/${SERVER_ID}/alerts/current`;
const EVENTS_PATH = `servers/${SERVER_ID}/alerts/events`;
let currentRef = null;
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when = (v) => { const n = Number(v); return n ? new Date(n).toLocaleString('id-ID') : '—'; };
const sevLabel = (v) => v === 'very_critical' ? 'VERY CRITICAL' : String(v || 'info').toUpperCase();

function setBackendState(online, text = null) {
  const badge = $('alertBackendState');
  if (!badge) return;
  badge.textContent = text || (online ? 'ALERT ENGINE ONLINE' : 'ALERT ENGINE UNREACHABLE');
  badge.classList.toggle('online', online);
  badge.classList.toggle('offline', !online);
}

function setCounts(s = {}) {
  const w = Number(s.warning) || 0;
  const c = Number(s.critical) || 0;
  const v = Number(s.veryCritical) || 0;
  const total = Number(s.total) || (w + c + v);
  if ($('warningCount')) $('warningCount').textContent = w;
  if ($('criticalCount')) $('criticalCount').textContent = c;
  if ($('veryCriticalCount')) $('veryCriticalCount').textContent = v;
  if ($('alertBellCount')) $('alertBellCount').textContent = total;
  document.querySelector('.nav-alert-badge')?.replaceChildren(document.createTextNode(String(total)));
}

function renderQueue(active = []) {
  if ($('activeIncidentCount')) $('activeIncidentCount').textContent = `${active.length} active`;
  if (!$('alertQueue')) return;
  if (!active.length) {
    $('alertQueue').innerHTML = '<div class="empty-state large-empty"><b>No active incidents.</b><span>ANASTUDIO currently has no unresolved alerts.</span></div>';
    return;
  }
  $('alertQueue').innerHTML = active.map(x => `<div class="incident-row severity-${esc(x.severity)}"><div class="incident-severity">${esc(sevLabel(x.severity))}</div><div class="incident-main"><strong>${esc(x.title)}</strong><span>${esc(x.message)}</span><small>${esc(x.source)} · detected ${esc(when(x.detectedAt))}</small></div><div class="incident-status">ACTIVE</div></div>`).join('');
}

function renderEvents(events = []) {
  if ($('logResultCount')) $('logResultCount').textContent = `${events.length} events`;
  if (!$('alertLogResults')) return;
  if (!events.length) {
    $('alertLogResults').innerHTML = '<div class="empty-state large-empty"><b>No matching events.</b><span>No events match the current filters.</span></div>';
    return;
  }
  $('alertLogResults').innerHTML = `<div class="table-scroll"><table class="alert-log-table"><thead><tr><th>Time</th><th>State</th><th>Severity</th><th>Source</th><th>Event</th><th>Value</th></tr></thead><tbody>${events.map(x => `<tr><td>${esc(when(x.resolvedAt || x.lastSeenAt || x.detectedAt))}</td><td><span class="event-state ${esc(x.type)}">${esc(String(x.type || 'event').toUpperCase())}</span></td><td><span class="event-severity severity-${esc(x.severity)}">${esc(sevLabel(x.severity))}</span></td><td>${esc(String(x.source || '—').toUpperCase())}</td><td><strong>${esc(x.title)}</strong><small>${esc(x.message)}</small></td><td>${x.value == null ? '—' : esc(x.value)}</td></tr>`).join('')}</tbody></table></div>`;
}

function eventTime(x) {
  return Number(x.resolvedAt || x.lastSeenAt || x.detectedAt || 0);
}

async function loadEvents() {
  const requested = Math.min(Math.max(Number($('alertLimit')?.value) || 100, 1), 500);
  // Pull extra recent records so client-side severity/source/search filters still have useful results.
  const snap = await get(query(ref(db, EVENTS_PATH), limitToLast(Math.min(Math.max(requested * 5, 100), 1000))));
  const raw = snap.val() || {};
  let events = Object.entries(raw).map(([firebaseKey, value]) => ({ firebaseKey, ...(value || {}) }));

  const severity = String($('alertSeverity')?.value || 'all').toLowerCase();
  const source = String($('alertSource')?.value || 'all').toLowerCase();
  const search = String($('alertSearch')?.value || '').trim().toLowerCase();

  if (severity !== 'all') events = events.filter(x => String(x.severity || '').toLowerCase() === severity);
  if (source !== 'all') events = events.filter(x => String(x.source || '').toLowerCase() === source);
  if (search) {
    events = events.filter(x => [x.id, x.title, x.message, x.source, x.type]
      .some(v => String(v || '').toLowerCase().includes(search)));
  }

  events.sort((a, b) => eventTime(b) - eventTime(a));
  renderEvents(events.slice(0, requested));
}

function startCurrentListener() {
  currentRef = ref(db, CURRENT_PATH);
  onValue(currentRef, (snap) => {
    const data = snap.val();
    if (!data) {
      setCounts({});
      renderQueue([]);
      setBackendState(false, 'ALERT DATA NOT FOUND');
      return;
    }
    setCounts(data.summary || {});
    renderQueue(Array.isArray(data.active) ? data.active : []);
    setBackendState(true);
  }, (error) => {
    console.error('[ALERT CURRENT]', error);
    setBackendState(false);
  });
}

export function initAlertsCenter() {
  stopAlertsCenter();
  setBackendState(false, 'CONNECTING TO ALERT ENGINE…');
  startCurrentListener();

  $('alertLogForm')?.addEventListener('submit', handleSubmit);
  loadEvents().catch((error) => {
    console.error('[ALERT EVENTS]', error);
    if ($('alertLogResults')) $('alertLogResults').innerHTML = '<div class="empty-state large-empty"><b>Unable to load alert history.</b><span>Firebase rejected or could not complete the request.</span></div>';
  });
}

function handleSubmit(e) {
  e.preventDefault();
  loadEvents().catch(error => console.error('[ALERT EVENTS]', error));
}

export function stopAlertsCenter() {
  if (currentRef) {
    off(currentRef);
    currentRef = null;
  }
  $('alertLogForm')?.removeEventListener('submit', handleSubmit);
}
