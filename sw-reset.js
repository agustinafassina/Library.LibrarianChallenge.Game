(async function resetLibrarianCache() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (_err) {
    // still send the player back to the game
  }
  const next = new URL("./", window.location.href);
  next.search = "";
  next.hash = "";
  window.location.replace(next.href);
})();
