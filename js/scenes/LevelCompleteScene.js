import { I18n } from "../utils/i18n.js?v=2";
import { makeButton, goToScene, COLORS, FONTS, formatTime } from "../utils/ui.js";

export default class LevelCompleteScene extends Phaser.Scene {
  constructor() {
    super("LevelCompleteScene");
  }

  init(data) {
    this.result = data;
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.fadeIn(200, 0, 0, 0);
    const { level, totalLevels, timeMs, moves, score, isBest, autoUsed } = this.result;

    this.add.graphics().fillStyle(COLORS.woodDark, 1).fillRect(0, 0, width, height);

    const pw = 460;
    const ph = 420;
    const px = width / 2 - pw / 2;
    const py = height / 2 - ph / 2;
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.ink, 0.96);
    panel.fillRoundedRect(px, py, pw, ph, 18);
    panel.lineStyle(4, COLORS.accent, 1);
    panel.strokeRoundedRect(px, py, pw, ph, 18);

    this.add
      .text(width / 2, py + 50, I18n.t("levelComplete"), {
        fontFamily: FONTS.title,
        fontSize: "40px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, py + 92, I18n.t("levelN", { n: level }), {
        fontFamily: FONTS.body,
        fontSize: "22px",
        color: "#d9a441",
      })
      .setOrigin(0.5);

    const stats = [
      I18n.t("statTime", { time: formatTime(timeMs) }),
      I18n.t("statMoves", { moves }),
      I18n.t("statScore", { score }),
    ].join("\n");
    this.add
      .text(width / 2, py + 170, stats, {
        fontFamily: FONTS.body,
        fontSize: "24px",
        color: "#f3e3c3",
        align: "center",
        lineSpacing: 10,
      })
      .setOrigin(0.5);

    if (autoUsed) {
      this.add
        .text(width / 2, py + 235, I18n.t("autoUsedNote"), {
          fontFamily: FONTS.body,
          fontSize: "13px",
          color: "#c87060",
          fontStyle: "italic",
          align: "center",
        })
        .setOrigin(0.5);
    } else if (isBest) {
      this.add
        .text(width / 2, py + 240, I18n.t("newBest"), {
          fontFamily: FONTS.body,
          fontSize: "20px",
          color: "#5bbf6a",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
    }

    const hasNext = level < totalLevels;
    let by = py + 295;

    if (hasNext) {
      // Primary CTA — large green
      makeButton(this, width / 2, by, I18n.t("nextLevel"), () =>
        goToScene(this, "GameScene", { level: level + 1 }),
        { width: 280, height: 54, fontSize: 22, fill: COLORS.good, textColor: "#ffffff" }
      );
      by += 70;
      // Secondary row — smaller, muted
      makeButton(this, width / 2 - 110, by, I18n.t("replay"), () =>
        goToScene(this, "GameScene", { level }),
        { width: 160, height: 42, fontSize: 16, fill: COLORS.woodLight, textColor: "#f3e3c3" }
      );
      makeButton(this, width / 2 + 110, by, I18n.t("levels"), () =>
        goToScene(this, "LevelSelectScene"),
        { width: 160, height: 42, fontSize: 16, fill: COLORS.woodLight, textColor: "#f3e3c3" }
      );
    } else {
      this.add
        .text(width / 2, by, I18n.t("finishedAll"), {
          fontFamily: FONTS.body,
          fontSize: "18px",
          color: "#d9a441",
          align: "center",
          wordWrap: { width: pw - 60 },
        })
        .setOrigin(0.5);
      by += 60;
      makeButton(this, width / 2 - 110, by, I18n.t("replay"), () =>
        goToScene(this, "GameScene", { level }),
        { width: 160, height: 42, fontSize: 16, fill: COLORS.woodLight, textColor: "#f3e3c3" }
      );
      makeButton(this, width / 2 + 110, by, I18n.t("levels"), () =>
        goToScene(this, "LevelSelectScene"),
        { width: 160, height: 42, fontSize: 16, fill: COLORS.woodLight, textColor: "#f3e3c3" }
      );
    }
  }
}
