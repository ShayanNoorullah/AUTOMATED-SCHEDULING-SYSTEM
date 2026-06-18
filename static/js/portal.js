function togglePortalSidebar() {
  document.getElementById("portalApp")?.classList.toggle("sidebar-open");
}

function showPortalTab(tab) {
  document.querySelectorAll(".portal-tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  document.querySelectorAll(".portal-tab-panel").forEach((p) => p.classList.toggle("on", p.id === `ptab-${tab}`));
}
