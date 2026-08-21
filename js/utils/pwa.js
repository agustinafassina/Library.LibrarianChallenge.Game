let deferredPrompt = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
  });
}

export const Pwa = {
  isStandalone() {
    if (typeof window === "undefined") return false;
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    return Boolean(window.navigator.standalone);
  },

  canPrompt() {
    return Boolean(deferredPrompt) && !this.isStandalone();
  },

  async promptInstall() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return choice?.outcome === "accepted";
  },
};
