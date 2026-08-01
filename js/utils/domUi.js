export function getCanvasLayout(game) {
  const canvas = game.canvas;
  const container = document.getElementById("game-container");
  if (!canvas || !container) return null;

  const canvasRect = canvas.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return {
    scaleX: canvasRect.width / game.scale.width,
    scaleY: canvasRect.height / game.scale.height,
    offsetLeft: canvasRect.left - containerRect.left,
    offsetTop: canvasRect.top - containerRect.top,
  };
}

export function placeGameBox(el, game, { x, y, width, height = null, anchor = "center" }) {
  const layout = getCanvasLayout(game);
  if (!layout) return;

  const { scaleX, scaleY, offsetLeft, offsetTop } = layout;
  const w = width * scaleX;
  const h = height != null ? height * scaleY : null;
  let left = offsetLeft + x * scaleX;
  let top = offsetTop + y * scaleY;

  if (anchor === "center") {
    left -= w / 2;
    if (h != null) top -= h / 2;
  } else if (anchor === "top-center") {
    left -= w / 2;
  } else if (anchor === "bottom-center") {
    left -= w / 2;
    if (h != null) top -= h;
  }

  el.style.position = "absolute";
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.width = `${w}px`;
  if (h != null) el.style.height = `${h}px`;
}

export function mountSceneUi(scene, className, layout) {
  const host = document.getElementById("game-container");
  const el = document.createElement("div");
  el.className = `lc-scene-ui ${className}`.trim();
  host.appendChild(el);

  const sync = () => placeGameBox(el, scene.game, layout);
  sync();

  const onResize = () => sync();
  scene.scale.on("resize", onResize);

  return {
    el,
    sync,
    destroy() {
      scene.scale.off("resize", onResize);
      el.remove();
    },
  };
}

export function mountScenePanel(scene, { panelClass = "", panelWidth = 460, buildPanel }) {
  const host = document.getElementById("game-container");
  const wrap = document.createElement("div");
  wrap.className = "lc-scene-panel-wrap";

  const panel = document.createElement("div");
  panel.className = ["lc-panel", panelClass].filter(Boolean).join(" ");
  panel.style.width =
    typeof panelWidth === "number" ? `min(${panelWidth}px, 100%)` : panelWidth;
  buildPanel(panel);
  wrap.appendChild(panel);
  host.appendChild(wrap);

  const sync = () => {
    placeGameBox(wrap, scene.game, {
      x: scene.scale.width / 2,
      y: scene.scale.height / 2,
      width: panelWidth,
      anchor: "top-center",
    });
    const top = parseFloat(wrap.style.top);
    if (!Number.isNaN(top)) {
      wrap.style.top = `${top - wrap.offsetHeight / 2}px`;
    }
  };
  sync();
  requestAnimationFrame(sync);

  const onResize = () => sync();
  scene.scale.on("resize", onResize);

  return {
    wrap,
    panel,
    destroy() {
      scene.scale.off("resize", onResize);
      wrap.remove();
    },
  };
}

export function domButton(label, className, onClick, { disabled = false } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = label;
  btn.disabled = disabled;
  btn.addEventListener("click", () => {
    if (!btn.disabled) onClick?.();
  });
  return btn;
}
