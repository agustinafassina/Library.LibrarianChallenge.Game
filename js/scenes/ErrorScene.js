import { I18n } from "../utils/i18n.js?v=2";
import { makeButton, goToScene, COLORS, FONTS } from "../utils/ui.js";

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

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.woodDark, 1);
    bg.fillRect(0, 0, width, height);

    const pw = 560;
    const ph = 340;
    const px = width / 2 - pw / 2;
    const py = height / 2 - ph / 2;
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
        fontSize: "36px",
        color: "#ffd5d5",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, py + 116, message, {
        fontFamily: FONTS.body,
        fontSize: "18px",
        color: "#f3e3c3",
        align: "center",
        wordWrap: { width: pw - 80 },
      })
      .setOrigin(0.5);

    if (details) {
      this.add
        .text(width / 2, py + 196, details.slice(0, 140), {
          fontFamily: FONTS.body,
          fontSize: "12px",
          color: "#c9b08a",
          align: "center",
          wordWrap: { width: pw - 100 },
        })
        .setOrigin(0.5);
    }

    const retryScene = this.errorData.retryScene;
    const retryData = this.errorData.retryData ?? {};

    makeButton(
      this,
      width / 2 - 110,
      py + ph - 54,
      I18n.t("retry"),
      () => {
        if (retryScene) goToScene(this, retryScene, retryData);
        else goToScene(this, "MenuScene");
      },
      { width: 180, height: 48, fontSize: 18, fill: COLORS.good, textColor: "#ffffff" }
    );

    makeButton(
      this,
      width / 2 + 110,
      py + ph - 54,
      I18n.t("menu"),
      () => goToScene(this, "MenuScene"),
      { width: 180, height: 48, fontSize: 18, fill: COLORS.woodLight, textColor: "#f3e3c3" }
    );
  }
}