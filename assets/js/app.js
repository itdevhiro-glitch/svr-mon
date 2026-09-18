import { initAuth } from "./auth.js";
import { startDashboard, stopDashboard } from "./dashboard.js?v=20260916-access-ui2";
import { initReports } from "./reports.js";
import { initBackupCenter, stopBackupCenter } from "./backup.js";
import { initAlertsCenter, stopAlertsCenter } from "./alerts.js?v=20260918-alerts-v3";
import { initStorageHealth, stopStorageHealth } from "./storage-health.js?v=20260918-sh-v16-fullsmart";
import { $, fmtClock } from "./utils.js";

function initNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.section;
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b === button));
      document.querySelectorAll(".dashboard-section").forEach((section) => section.classList.toggle("active-section", section.id === target));
      $("sectionLabel").textContent = target.toUpperCase();
    });
  });
}

function initClock() {
  const tick = () => { $("footerClock").textContent = fmtClock(); };
  tick(); setInterval(tick, 1000);
}

initNavigation();
function initResponsiveManagementUI() {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.getElementById('mobileNavToggle');
  const backdrop = document.getElementById('mobileNavBackdrop');
  const closeMenu = () => {
    sidebar?.classList.remove('mobile-open');
    backdrop?.classList.remove('show');
    document.body.classList.remove('nav-open');
    toggle?.setAttribute('aria-expanded','false');
  };
  toggle?.setAttribute('aria-expanded','false');
  toggle?.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const open = !sidebar?.classList.contains('mobile-open');
    sidebar?.classList.toggle('mobile-open', open);
    backdrop?.classList.toggle('show', open);
    document.body.classList.toggle('nav-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
  });
  backdrop?.addEventListener('click', closeMenu);
  document.querySelectorAll('.nav-item').forEach(el => el.addEventListener('click', closeMenu));

  const tabs = [...document.querySelectorAll('#storage [data-storage-jump]')];
  const groups = {
    paths: ['storagePathsWorkspace','storageFilesystemWorkspace'],
    identities: ['storageIdentityWorkspace'],
    smb: ['storageSmbWorkspace'],
    audit: ['storageAuditWorkspace']
  };
  const panels = [...document.querySelectorAll('#storage .storage-workspace-panel')];
  const show = (key='paths') => {
    if (!groups[key]) key='paths';
    tabs.forEach(t => {
      const active=t.dataset.storageJump===key;
      t.classList.toggle('active',active);
      t.setAttribute('aria-selected',String(active));
    });
    panels.forEach(p => p.classList.remove('storage-panel-active'));
    groups[key].forEach(id => document.getElementById(id)?.classList.add('storage-panel-active'));
    try { sessionStorage.setItem('anastudio-storage-tab',key); } catch {}
  };
  tabs.forEach(t => t.addEventListener('click', e => { e.preventDefault(); show(t.dataset.storageJump); }));
  let initial='paths';
  try { initial=sessionStorage.getItem('anastudio-storage-tab')||'paths'; } catch {}
  show(initial);
  document.getElementById('alertBell')?.addEventListener('click',()=>document.querySelector('.nav-item[data-section="alerts"]')?.click());
}
initResponsiveManagementUI();
initReports();
initClock();
initAuth(() => { startDashboard(); initBackupCenter(); initAlertsCenter(); initStorageHealth(); }, () => { stopDashboard(); stopBackupCenter(); stopAlertsCenter(); stopStorageHealth(); });
