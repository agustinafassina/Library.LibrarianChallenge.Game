import BootScene from "./scenes/BootScene.js";
import MenuScene from "./scenes/MenuScene.js?v=3";
import LevelSelectScene from "./scenes/LevelSelectScene.js";
import BooksScene from "./scenes/BooksScene.js";
import BookDetailScene from "./scenes/BookDetailScene.js";
import GameScene from "./scenes/GameScene.js";
import LevelCompleteScene from "./scenes/LevelCompleteScene.js";
import ErrorScene from "./scenes/ErrorScene.js";
import { closeDomOverlay } from "./utils/domOverlay.js";
import { getGameSize, isPortraitViewport, syncOrientationClasses } from "./config/viewport.js";

function syncViewportHeight() {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${height}px`);
}

const initialSize = getGameSize();
syncViewportHeight();
syncOrientationClasses(isPortraitViewport());

const config = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: "#1e1410",
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: initialSize.width,
    height: initialSize.height,
  },
  dom: {
    createContainer: true,
  },
  input: { activePointers: 2 },
  scene: [BootScene, MenuScene, LevelSelectScene, BooksScene, BookDetailScene, GameScene, LevelCompleteScene, ErrorScene],
};

const game = new Phaser.Game(config);

let resizeTimer = null;
let lastOrientation = isPortraitViewport() ? "portrait" : "landscape";

function restartActiveScene() {
  closeDomOverlay();
  const active = game.scene.getScenes(true)[0];
  if (!active) return;
  const data = { ...(active.scene.settings.data ?? {}) };
  active.scene.restart(data);
}

function refreshGameScale() {
  syncViewportHeight();

  const portrait = isPortraitViewport();
  syncOrientationClasses(portrait);
  const orientation = portrait ? "portrait" : "landscape";
  const { width, height } = getGameSize();

  const sizeChanged = game.scale.width !== width || game.scale.height !== height;
  if (sizeChanged) {
    game.scale.setGameSize(width, height);
  }
  game.scale.refresh();

  if (sizeChanged && lastOrientation !== orientation && game.scene.getScenes(true).length > 0) {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(restartActiveScene, 120);
  }

  lastOrientation = orientation;
}

window.addEventListener("resize", refreshGameScale);
window.addEventListener("orientationchange", refreshGameScale);
window.visualViewport?.addEventListener("resize", refreshGameScale);
window.visualViewport?.addEventListener("scroll", syncViewportHeight);

if (new URLSearchParams(window.location.search).has("test")) {
  window.__GAME__ = game;
}
