let activeOverlay = null;
let activeRestore = null;

export function stopPointerPropagation(event) {
  event.stopPropagation();
}

function blockGameInput(scene) {
  const canvas = document.querySelector("#game-container canvas");
  const container = document.getElementById("game-container");
  if (scene?.input) scene.input.enabled = false;
  if (canvas) canvas.style.pointerEvents = "none";
  container?.classList.add("lc-overlay-open");

  return () => {
    if (scene?.input) scene.input.enabled = true;
    if (canvas) canvas.style.pointerEvents = "";
    container?.classList.remove("lc-overlay-open");
  };
}

export function closeDomOverlay() {
  activeRestore?.();
  activeRestore = null;
  activeOverlay?.remove();
  activeOverlay = null;
}

export function openDomOverlay({
  scene,
  panelClass = "",
  panelWidth = 460,
  closeOnBackdrop = true,
  onBackdropClick,
  buildPanel,
}) {
  closeDomOverlay();
  activeRestore = blockGameInput(scene);

  const overlay = document.createElement("div");
  overlay.className = "lc-overlay";

  const panel = document.createElement("div");
  panel.className = ["lc-panel", panelClass].filter(Boolean).join(" ");
  panel.style.width =
    typeof panelWidth === "number" ? `min(${panelWidth}px, 100%)` : panelWidth;

  const close = () => closeDomOverlay();
  buildPanel(panel, close);

  for (const el of panel.querySelectorAll("button, select, input, textarea, a, label")) {
    el.addEventListener("pointerdown", stopPointerPropagation);
    el.addEventListener("mousedown", stopPointerPropagation);
    el.addEventListener("click", stopPointerPropagation);
    el.addEventListener("touchstart", stopPointerPropagation, { passive: true });
  }

  panel.addEventListener("pointerdown", stopPointerPropagation);
  panel.addEventListener("mousedown", stopPointerPropagation);
  panel.addEventListener("click", stopPointerPropagation);

  overlay.appendChild(panel);

  if (closeOnBackdrop) {
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) (onBackdropClick ?? close)();
    });
  }

  document.getElementById("game-container")?.appendChild(overlay);
  activeOverlay = overlay;
  return { overlay, panel, close };
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function paragraphsFromText(text) {
  return String(text)
    .split("\n\n")
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block)}</p>`)
    .join("");
}
