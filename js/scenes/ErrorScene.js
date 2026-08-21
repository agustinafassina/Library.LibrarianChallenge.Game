import { I18n } from "../utils/i18n.js?v=2";
import { goToScene, COLORS, FONTS, bindResizeRestart, panelBox, placeButtonRow } from "../utils/ui.js";
import { fillLibraryRoom } from "../utils/libraryArt.js";

export default class ErrorScene extends Phaser.Scene {
  constructor() {
    super("ErrorScene");
  }

  init(data) {
    this.errorData = data ?? {};
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.fadeIn(180, 0, 0, 0);

    fillLibraryRoom(this);

    const { pw, ph, px, py } = panelBox(width, height, 560, 340);
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.ink, 0.96);
    panel.fillRoundedRect(px, py, pw, ph, 18);
    panel.lineStyle(3, COLORS.bad, 1);
    panel.strokeRoundedRect(px, py, pw, ph, 18);

    const title = this.errorData.title || I18n.t("errorTitle");
    const message = this.errorData.message || I18n.t(this.errorData.messageKey || "errorBody");
    const details = this.errorData.details ? String(this.errorData.details) : "";

    this.add
      .text(width / 2, py + 46, title, {
        fontFamily: FONTS.title,
        fontSize: pw < 360 ? "26px" : "36px",
        color: "#ffd5d5",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: pw - 40 },
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, py + 116, message, {
        fontFamily: FONTS.body,
        fontSize: "18px",
        color: "#f3e3c3",
        align: "center",
        wordWrap: { width: pw - 48 },
      })
      .setOrigin(0.5);

    if (details) {
      this.add
        .text(width / 2, py + 196, details.slice(0, 140), {
          fontFamily: FONTS.body,
          fontSize: "12px",
          color: "#c9b08a",
          align: "center",
          wordWrap: { width: pw - 60 },
        })
        .setOrigin(0.5);
    }

    const retryScene = this.errorData.retryScene;
    const retryData = this.errorData.retryData ?? {};

    placeButtonRow(this, width / 2, py + ph - 54, [
      {
        label: I18n.t("retry"),
        onClick: () => {
          if (retryScene) goToScene(this, retryScene, retryData);
          else goToScene(this, "MenuScene");
        },
        opts: { width: 180, height: 48, fontSize: 18, fill: COLORS.good, textColor: "#ffffff" },
      },
      {
        label: I18n.t("menu"),
        onClick: () => goToScene(this, "MenuScene"),
        opts: { width: 180, height: 48, fontSize: 18, fill: COLORS.woodLight, textColor: "#f3e3c3" },
      },
    ]);

    bindResizeRestart(this);
  }
}
