import { Sfx } from "./utils/sfx.js";
import BootScene from "./scenes/BootScene.js";
import MenuScene from "./scenes/MenuScene.js?v=3";
import LevelSelectScene from "./scenes/LevelSelectScene.js";
import BooksScene from "./scenes/BooksScene.js";
import BookDetailScene from "./scenes/BookDetailScene.js";
import GameScene from "./scenes/GameScene.js";
import LevelCompleteScene from "./scenes/LevelCompleteScene.js";
import ErrorScene from "./scenes/ErrorScene.js";

function viewportCssHeight() {
  const vv = window.visualViewport;
  if (vv?.height) return Math.round(vv.height);
  return window.innerHeight;
}

function syncViewportHeight() {
  document.documentElement.style.setProperty("--app-height", `${viewportCssHeight()}px`);
}

syncViewportHeight();

const config = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: "#1e1410",
  antialias: true,
  roundPixels: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  render: {
    antialias: true,
    roundPixels: true,
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true,
    width: window.innerWidth,
    height: viewportCssHeight(),
  },
  dom: {
    createContainer: true,
  },
  input: { activePointers: 2 },
  scene: [BootScene, MenuScene, LevelSelectScene, BooksScene, BookDetailScene, GameScene, LevelCompleteScene, ErrorScene],
};

const game = new Phaser.Game(config);

let resizeTimer = null;
function refreshGameScale() {
  syncViewportHeight();
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => game.scale.refresh(), 80);
}

window.addEventListener("resize", refreshGameScale);
window.addEventListener("orientationchange", refreshGameScale);
window.visualViewport?.addEventListener("resize", refreshGameScale);
window.visualViewport?.addEventListener("scroll", refreshGameScale);

Sfx.init();

const isE2E = new URLSearchParams(window.location.search).has("test");
if (isE2E) {
  window.__GAME__ = game;
} else if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    const version = window.LIBRARIAN_CHALLENGE_CONFIG?.version || "dev";
    navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(version)}`).catch((err) => {
      console.warn("[pwa] service worker failed", err);
    });
  });
}
