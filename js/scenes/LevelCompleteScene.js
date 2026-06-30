import { I18n } from "../utils/i18n.js?v=2";
import { makeButton, COLORS, FONTS, formatTime } from "../utils/ui.js";

export default class LevelCompleteScene extends Phaser.Scene {
  constructor() {
    super("LevelCompleteScene");
  }

  init(data) {
    this.result = data;
  }

  create() {
    const { width, height } = this.scale;
    const { level, totalLevels, timeMs, moves, score, isBest } = this.result;

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

    if (isBest) {
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
    let by = py + 300;

    if (hasNext) {
      makeButton(this, width / 2, by, I18n.t("nextLevel"), () =>
        this.scene.start("GameScene", { level: level + 1 })
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
    }

    by += 64;
    makeButton(this, width / 2 - 120, by, I18n.t("replay"), () =>
      this.scene.start("GameScene", { level })
    , { width: 150, height: 48, fontSize: 18, fill: COLORS.woodLight, textColor: "#f3e3c3" });

    makeButton(this, width / 2 + 120, by, I18n.t("levels"), () =>
      this.scene.start("LevelSelectScene")
    , { width: 150, height: 48, fontSize: 18, fill: COLORS.woodLight, textColor: "#f3e3c3" });
  }
}
