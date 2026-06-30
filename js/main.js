import BootScene from "./scenes/BootScene.js";
import MenuScene from "./scenes/MenuScene.js";
import LevelSelectScene from "./scenes/LevelSelectScene.js";
import GameScene from "./scenes/GameScene.js";
import LevelCompleteScene from "./scenes/LevelCompleteScene.js";

const config = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: "#1e1410",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 640,
  },
  input: { activePointers: 2 },
  scene: [BootScene, MenuScene, LevelSelectScene, GameScene, LevelCompleteScene],
};

new Phaser.Game(config);
