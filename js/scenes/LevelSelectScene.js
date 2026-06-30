import { Storage } from "../utils/storage.js";
import { loadLevels } from "../utils/dataLoader.js";
import { I18n } from "../utils/i18n.js?v=2";
import { makeButton, COLORS, FONTS, formatTime } from "../utils/ui.js";

export default class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super("LevelSelectScene");
  }

  async create() {
    const { width, height } = this.scale;

    const g = this.add.graphics();
    g.fillStyle(COLORS.woodDark, 1);
    g.fillRect(0, 0, width, height);

    this.add
      .text(width / 2, 60, I18n.t("levelSelect"), {
        fontFamily: FONTS.title,
        fontSize: "44px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    makeButton(this, 120, 40, I18n.t("back"), () => this.scene.start("MenuScene"), {
      width: 140,
      height: 44,
      fontSize: 18,
    });

    const loading = this.add
      .text(width / 2, height / 2, I18n.t("loadingLevels"), {
        fontFamily: FONTS.body,
        fontSize: "22px",
        color: "#d9a441",
      })
      .setOrigin(0.5);

    let levels;
    try {
      levels = await loadLevels();
    } catch (err) {
      loading.setText(I18n.t("levelsError"));
      console.error(err);
      return;
    }
    loading.destroy();

    const maxUnlocked = Storage.getMaxLevelUnlocked();
    const cols = Math.min(levels.length, 5);
    const cellW = 170;
    const cellH = 150;
    const startX = width / 2 - ((cols - 1) * cellW) / 2;
    const startY = 170;

    levels.forEach((lvl, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * cellW;
      const y = startY + row * cellH;
      const unlocked = lvl.level <= maxUnlocked;

      const card = this.add.graphics();
      card.fillStyle(unlocked ? COLORS.wood : 0x33241a, 1);
      card.fillRoundedRect(x - 75, y - 55, 150, 110, 12);
      card.lineStyle(3, unlocked ? COLORS.accent : 0x000000, unlocked ? 1 : 0.3);
      card.strokeRoundedRect(x - 75, y - 55, 150, 110, 12);

      this.add
        .text(
          x,
          y - 30,
          unlocked
            ? I18n.t("levelN", { n: lvl.level })
            : I18n.t("lockedN", { n: lvl.level }),
          {
            fontFamily: FONTS.body,
            fontSize: "22px",
            color: unlocked ? "#f3e3c3" : "#8a7355",
            fontStyle: "bold",
          }
        )
        .setOrigin(0.5);

      this.add
        .text(x, y + 2, I18n.pick(lvl, "title"), {
          fontFamily: FONTS.body,
          fontSize: "13px",
          color: unlocked ? "#d9a441" : "#6e5a42",
          align: "center",
          wordWrap: { width: 140 },
        })
        .setOrigin(0.5);

      const best = Storage.getBestForLevel(lvl.level);
      const bestText = best
        ? I18n.t("best", { score: best.score, time: formatTime(best.timeMs) })
        : I18n.t("notPlayed");
      this.add
        .text(x, y + 36, bestText, {
          fontFamily: FONTS.body,
          fontSize: "12px",
          color: unlocked ? "#c9b08a" : "#5a4836",
        })
        .setOrigin(0.5);

      if (unlocked) {
        const hit = this.add
          .rectangle(x, y, 150, 110, 0xffffff, 0.001)
          .setInteractive({ useHandCursor: true });
        hit.on("pointerover", () => card.setAlpha(0.85));
        hit.on("pointerout", () => card.setAlpha(1));
        hit.on("pointerdown", () => this.scene.start("GameScene", { level: lvl.level }));
      }
    });
  }
}
