import { Storage } from "../utils/storage.js";
import { I18n } from "../utils/i18n.js?v=2";
import { openFeedbackForm, closeFeedbackForm } from "../utils/feedbackForm.js";
import { appVersion } from "../utils/appInfo.js";
import { makeButton, goToScene, COLORS, FONTS } from "../utils/ui.js";

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super("MenuScene");
  }

  create() {
    const { width, height } = this.scale;
    Storage.touchSession();
    this.cameras.main.fadeIn(200, 0, 0, 0);

    this.drawBackground();

    this.add
      .sprite(width * 0.8, height * 0.62, "librarian", "idle")
      .setScale(1.6)
      .setOrigin(0.5)
      .play("librarian-idle");

    this.add
      .text(width / 2, height * 0.2, I18n.t("appTitle"), {
        fontFamily: FONTS.title,
        fontSize: "52px",
        color: "#f3e3c3",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(0, 4, "#00000088", 6);

    this.add
      .text(width / 2, height * 0.28, I18n.t("subtitle"), {
        fontFamily: FONTS.body,
        fontSize: "20px",
        color: "#d9a441",
      })
      .setOrigin(0.5);

    const cx = width * 0.34;
    let y = height * 0.38;
    const gap = 58;

    // ── Primary actions ───────────────────────────────────────
    makeButton(this, cx, y, I18n.t("start"), () => {
      goToScene(this, "GameScene", { level: 1 });
    });

    const hasProgress = Storage.hasProgress();
    y += gap;
    makeButton(
      this,
      cx,
      y,
      hasProgress ? I18n.t("continueLvl", { level: Storage.getMaxLevelUnlocked() }) : I18n.t("continue"),
      () => goToScene(this, "GameScene", { level: Storage.getMaxLevelUnlocked() }),
      { enabled: hasProgress }
    );

    y += gap;
    makeButton(this, cx, y, I18n.t("levelSelect"), () => {
      goToScene(this, "LevelSelectScene");
    });

    // ── Secondary actions (2x2) ───────────────────────────────
    y += gap + 20;
    const secW = 110;
    const secH = 50;
    const secGapX = 12;
    const secGapY = 12;
    const secOpts = { width: secW, height: secH, fontSize: 15, fill: COLORS.woodLight, textColor: "#f3e3c3" };
    const secRow1Y = y;
    const secRow2Y = y + secH + secGapY;

    makeButton(this, cx - secW / 2 - secGapX / 2, secRow1Y, I18n.t("tutorial"), () => this.openTutorial(), secOpts);
    makeButton(this, cx + secW / 2 + secGapX / 2, secRow1Y, I18n.t("books"), () => goToScene(this, "BooksScene"), secOpts);
    makeButton(this, cx - secW / 2 - secGapX / 2, secRow2Y, I18n.t("settings"), () => this.openSettings(), secOpts);
    makeButton(this, cx + secW / 2 + secGapX / 2, secRow2Y, I18n.t("feedback"), () => openFeedbackForm({ scene: this }), secOpts);

    // ── Danger zone: reset, small, bottom ─────────────────────
    makeButton(this, cx, height - 52, I18n.t("resetProgress"), () => this.confirmReset(), {
      width: 200,
      height: 36,
      fontSize: 14,
      fill: COLORS.bad,
      fillHover: 0xa53f3e,
      textColor: "#ffffff",
      enabled: hasProgress,
    });

    this.add
      .text(width - 16, height - 12, I18n.t("appVersion", { version: appVersion() }), {
        fontFamily: FONTS.body,
        fontSize: "14px",
        color: "#c9b08a",
      })
      .setOrigin(1, 1)
      .setDepth(10);

    this.events.once("shutdown", () => closeFeedbackForm());
  }

  openModal(pw, ph) {
    const { width, height } = this.scale;
    const items = [];

    const dim = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.65)
      .setDepth(100)
      .setInteractive();
    items.push(dim);

    const panel = this.add.graphics().setDepth(101);
    panel.fillStyle(COLORS.ink, 0.98);
    panel.fillRoundedRect(width / 2 - pw / 2, height / 2 - ph / 2, pw, ph, 16);
    panel.lineStyle(3, COLORS.accent, 1);
    panel.strokeRoundedRect(width / 2 - pw / 2, height / 2 - ph / 2, pw, ph, 16);
    items.push(panel);

    const close = () => items.forEach((it) => it.destroy());
    return { items, close };
  }

  openTutorial() {
    const { width, height } = this.scale;
    const pw = 520;
    const bodyTop = 88;
    const bottomPad = 24;
    const gapBeforeButton = 20;
    const buttonH = 46;
    const maxPh = height - 40;

    const measureBody = (fontSize) => {
      const probe = this.add
        .text(0, 0, I18n.t("tutorialBody"), {
          fontFamily: FONTS.body,
          fontSize: `${fontSize}px`,
          color: "#c9b08a",
          align: "left",
          lineSpacing: 6,
          wordWrap: { width: pw - 60 },
        })
        .setVisible(false);
      const measured = probe.height;
      probe.destroy();
      return measured;
    };

    let fontSize = 15;
    let bodyHeight = measureBody(fontSize);
    let ph = bodyTop + bodyHeight + gapBeforeButton + buttonH + bottomPad;
    while (ph > maxPh && fontSize > 12) {
      fontSize -= 1;
      bodyHeight = measureBody(fontSize);
      ph = bodyTop + bodyHeight + gapBeforeButton + buttonH + bottomPad;
    }
    ph = Math.min(maxPh, Math.max(420, ph));

    const { items, close } = this.openModal(pw, ph);
    const panelTop = height / 2 - ph / 2;
    const cx = width / 2;

    items.push(
      this.add
        .text(cx, panelTop + 40, I18n.t("tutorialTitle"), {
          fontFamily: FONTS.title,
          fontSize: "28px",
          color: "#f3e3c3",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(102)
    );

    const bodyText = this.add
      .text(cx, panelTop + bodyTop, I18n.t("tutorialBody"), {
        fontFamily: FONTS.body,
        fontSize: `${fontSize}px`,
        color: "#c9b08a",
        align: "left",
        lineSpacing: 6,
        wordWrap: { width: pw - 60 },
      })
      .setOrigin(0.5, 0)
      .setDepth(102);
    items.push(bodyText);

    const panelBottom = panelTop + ph;
    const buttonY = Math.min(
      panelTop + bodyTop + bodyText.height + gapBeforeButton + buttonH / 2,
      panelBottom - bottomPad - buttonH / 2
    );
    items.push(
      makeButton(this, cx, buttonY, I18n.t("done"), () => close(), {
        width: 160,
        height: buttonH,
        fontSize: 18,
        fill: COLORS.woodLight,
        textColor: "#f3e3c3",
      }).setDepth(102)
    );
  }

  openSettings() {
    const { width, height } = this.scale;
    const { items, close } = this.openModal(440, 290);

    items.push(
      this.add
        .text(width / 2, height / 2 - 92, I18n.t("settingsTitle"), {
          fontFamily: FONTS.title,
          fontSize: "30px",
          color: "#f3e3c3",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(102)
    );

    items.push(
      this.add
        .text(width / 2, height / 2 - 44, I18n.t("language"), {
          fontFamily: FONTS.body,
          fontSize: "18px",
          color: "#d9a441",
        })
        .setOrigin(0.5)
        .setDepth(102)
    );

    const langs = I18n.available;
    const totalW = langs.length * 160 + (langs.length - 1) * 20;
    const startX = width / 2 - totalW / 2 + 80;
    langs.forEach((lang, i) => {
      const isCurrent = lang.code === I18n.lang;
      const btn = makeButton(
        this,
        startX + i * 180,
        height / 2 + 6,
        lang.label,
        () => {
          if (lang.code !== I18n.lang) {
            I18n.set(lang.code);
            close();
            this.scene.restart();
          }
        },
        {
          width: 160,
          height: 50,
          fontSize: 18,
          fill: isCurrent ? COLORS.accent : COLORS.woodLight,
          textColor: isCurrent ? "#2c1d14" : "#f3e3c3",
        }
      ).setDepth(102);
      items.push(btn);
    });

    items.push(
      this.add
        .text(width / 2, height / 2 + 52, I18n.t("appVersion", { version: appVersion() }), {
          fontFamily: FONTS.body,
          fontSize: "15px",
          color: "#c9b08a",
        })
        .setOrigin(0.5)
        .setDepth(102)
    );

    items.push(
      makeButton(this, width / 2, height / 2 + 98, I18n.t("done"), () => close(), {
        width: 160,
        height: 46,
        fontSize: 18,
        fill: COLORS.woodLight,
        textColor: "#f3e3c3",
      }).setDepth(102)
    );
  }

  confirmReset() {
    const { width, height } = this.scale;
    const { items, close } = this.openModal(440, 220);

    items.push(
      this.add
        .text(width / 2, height / 2 - 60, I18n.t("confirmTitle"), {
          fontFamily: FONTS.title,
          fontSize: "28px",
          color: "#f3e3c3",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(102)
    );
    items.push(
      this.add
        .text(width / 2, height / 2 - 16, I18n.t("confirmBody"), {
          fontFamily: FONTS.body,
          fontSize: "16px",
          color: "#d9a441",
          align: "center",
          wordWrap: { width: 380 },
        })
        .setOrigin(0.5)
        .setDepth(102)
    );

    items.push(
      makeButton(
        this,
        width / 2 - 100,
        height / 2 + 52,
        I18n.t("yesReset"),
        () => {
          Storage.clearAll();
          close();
          this.scene.restart();
        },
        { width: 170, height: 50, fontSize: 18, fill: COLORS.bad, fillHover: 0xa53f3e, textColor: "#ffffff" }
      ).setDepth(102)
    );
    items.push(
      makeButton(this, width / 2 + 100, height / 2 + 52, I18n.t("cancel"), () => close(), {
        width: 170,
        height: 50,
        fontSize: 18,
        fill: COLORS.woodLight,
        textColor: "#f3e3c3",
      }).setDepth(102)
    );
  }

  drawBackground() {
    const { width, height } = this.scale;
    const g = this.add.graphics();
    g.fillStyle(COLORS.woodDark, 1);
    g.fillRect(0, 0, width, height);
    g.lineStyle(2, 0x000000, 0.15);
    for (let yy = 80; yy < height; yy += 90) {
      g.beginPath();
      g.moveTo(0, yy);
      g.lineTo(width, yy);
      g.strokePath();
    }
  }
}
