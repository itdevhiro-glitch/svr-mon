import { initAuth } from "./auth.js";
import { startDashboard, stopDashboard } from "./dashboard.js";
import { initReports } from "./reports.js";
import { initBackupCenter, stopBackupCenter } from "./backup.js";
import { $, fmtClock } from "./utils.js";
import { initManagementUI } from "./management-ui.js";

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
initManagementUI();
initReports();
initClock();
initAuth(() => { startDashboard(); initBackupCenter(); }, () => { stopDashboard(); stopBackupCenter(); });
