import { I18n } from "../utils/i18n.js?v=2";
import { makeButton, goToScene, COLORS, FONTS, formatTime, bindResizeRestart, panelBox, placeButtonRow } from "../utils/ui.js";
import { fillLibraryRoom } from "../utils/libraryArt.js";

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
    const { level, totalLevels, timeMs, moves, score, isBest, autoUsed, hintsUsed = 0 } = this.result;

    fillLibraryRoom(this);

    const stack = width < 420;
    const { pw, ph, px, py } = panelBox(width, height, 460, stack ? 480 : 420);
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.ink, 0.96);
    panel.fillRoundedRect(px, py, pw, ph, 18);
    panel.lineStyle(4, COLORS.accent, 1);
    panel.strokeRoundedRect(px, py, pw, ph, 18);

    this.add
      .text(width / 2, py + 50, I18n.t("levelComplete"), {
        fontFamily: FONTS.title,
        fontSize: pw < 360 ? "28px" : "40px",
        color: "#f3e3c3",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: pw - 40 },
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
          wordWrap: { width: pw - 40 },
        })
        .setOrigin(0.5);
    } else if (hintsUsed > 0) {
      this.add
        .text(width / 2, py + 235, I18n.t("hintUsedNote", { count: hintsUsed }), {
          fontFamily: FONTS.body,
          fontSize: "13px",
          color: "#d0b27e",
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
      makeButton(this, width / 2, by, I18n.t("nextLevel"), () =>
        goToScene(this, "GameScene", { level: level + 1 }),
        { width: Math.min(280, pw - 48), height: 54, fontSize: 22, fill: COLORS.good, textColor: "#ffffff" }
      );
      by += 70;
      placeButtonRow(this, width / 2, by, [
        {
          label: I18n.t("replay"),
          onClick: () => goToScene(this, "GameScene", { level }),
          opts: { width: 160, height: 42, fontSize: 16, fill: COLORS.woodLight, textColor: "#f3e3c3" },
        },
        {
          label: I18n.t("levels"),
          onClick: () => goToScene(this, "LevelSelectScene"),
          opts: { width: 160, height: 42, fontSize: 16, fill: COLORS.woodLight, textColor: "#f3e3c3" },
        },
      ]);
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
      placeButtonRow(this, width / 2, by, [
        {
          label: I18n.t("replay"),
          onClick: () => goToScene(this, "GameScene", { level }),
          opts: { width: 160, height: 42, fontSize: 16, fill: COLORS.woodLight, textColor: "#f3e3c3" },
        },
        {
          label: I18n.t("levels"),
          onClick: () => goToScene(this, "LevelSelectScene"),
          opts: { width: 160, height: 42, fontSize: 16, fill: COLORS.woodLight, textColor: "#f3e3c3" },
        },
      ]);
    }

    bindResizeRestart(this);
  }
}
