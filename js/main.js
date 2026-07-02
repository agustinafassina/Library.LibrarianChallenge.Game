import BootScene from "./scenes/BootScene.js";
import MenuScene from "./scenes/MenuScene.js";
import LevelSelectScene from "./scenes/LevelSelectScene.js";
import GameScene from "./scenes/GameScene.js";
import LevelCompleteScene from "./scenes/LevelCompleteScene.js";
import ErrorScene from "./scenes/ErrorScene.js";

function syncViewportHeight() {
  document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
}

syncViewportHeight();

const config = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: "#1e1410",
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 640,
  },
  input: { activePointers: 2 },
  scene: [BootScene, MenuScene, LevelSelectScene, GameScene, LevelCompleteScene, ErrorScene],
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

if (new URLSearchParams(window.location.search).has("test")) {
  window.__GAME__ = game;
}
