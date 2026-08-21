import { Storage } from "../utils/storage.js";
import { I18n } from "../utils/i18n.js?v=2";
import { openFeedbackForm, closeFeedbackForm } from "../utils/feedbackForm.js";
import { appVersion } from "../utils/appInfo.js";
import { makeButton, goToScene, COLORS, FONTS, bindResizeRestart, panelBox, isCoarsePointer } from "../utils/ui.js";
import { Sfx } from "../utils/sfx.js";
import { Pwa } from "../utils/pwa.js";
import { getUiLayout } from "../config/layout.js";
import { fillLibraryRoom } from "../utils/libraryArt.js";

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super("MenuScene");
  }

  create() {
    const { width, height } = this.scale;
    const ui = getUiLayout(width, height);
    Storage.touchSession();
    this.cameras.main.fadeIn(200, 0, 0, 0);

    this.drawBackground();

    const lib = ui.portrait
      ? { x: width - 52 - ui.safe.right, y: 58 + ui.safe.top, scale: 0.34, alpha: 1, originY: 0 }
      : {
          x: width * 0.8,
          y: height * 0.62,
          scale: Math.max(0.9, ui.librarianScale * 1.12),
          alpha: 1,
          originY: 0.5,
        };
    const mascot = this.add
      .sprite(lib.x, lib.y, "librarian", "idle")
      .setScale(lib.scale)
      .setOrigin(0.5, lib.originY)
      .setAlpha(lib.alpha)
      .play("librarian-idle");
    this.tweens.add({
      targets: mascot,
      y: lib.y - 7,
      angle: 1.6,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    const titleSize = ui.compact ? (ui.portrait ? 36 : 42) : 52;
    const titleY = ui.portrait ? 56 + ui.safe.top : height * 0.2;
    this.add
      .text(width / 2, titleY, I18n.t("appTitle"), {
        fontFamily: FONTS.title,
        fontSize: `${titleSize}px`,
        color: "#f3e3c3",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: width - 32 },
      })
      .setOrigin(0.5)
      .setShadow(0, 4, "#00000088", 6);

    this.add
      .text(width / 2, titleY + (ui.portrait ? 42 : height * 0.08), I18n.t("subtitle"), {
        fontFamily: FONTS.body,
        fontSize: ui.compact ? "16px" : "20px",
        color: "#d9a441",
        align: "center",
        wordWrap: { width: width - 40 },
      })
      .setOrigin(0.5);

    const cx = ui.menuCx;
    const btnW = ui.menuBtnW;
    let y = ui.portrait ? titleY + 110 : height * 0.38;
    const gap = ui.portrait ? Math.min(58, (height - y - 120) / 5) : 58;

    makeButton(this, cx, y, I18n.t("start"), () => {
      goToScene(this, "GameScene", { level: 1 });
    }, { width: btnW });

    const hasProgress = Storage.hasProgress();
    y += gap;
    makeButton(
      this,
      cx,
      y,
      hasProgress ? I18n.t("continueLvl", { level: Storage.getMaxLevelUnlocked() }) : I18n.t("continue"),
      () => goToScene(this, "GameScene", { level: Storage.getMaxLevelUnlocked() }),
      { enabled: hasProgress, width: btnW }
    );

    y += gap;
    makeButton(this, cx, y, I18n.t("levelSelect"), () => {
      goToScene(this, "LevelSelectScene");
    }, { width: btnW });

    y += gap + (ui.portrait ? 12 : 20);
    const secW = ui.portrait ? Math.min(148, (btnW - 12) / 2) : 110;
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

    makeButton(this, cx, height - 36 - ui.safe.bottom, I18n.t("resetProgress"), () => this.confirmReset(), {
      width: Math.min(200, btnW),
      height: 36,
      fontSize: 14,
      fill: COLORS.bad,
      fillHover: 0xa53f3e,
      textColor: "#ffffff",
      enabled: hasProgress,
    });

    this.add
      .text(width - 16 - ui.safe.right, height - 12 - ui.safe.bottom, I18n.t("appVersion", { version: appVersion() }), {
        fontFamily: FONTS.body,
        fontSize: "14px",
        color: "#c9b08a",
      })
      .setOrigin(1, 1)
      .setDepth(10);

    this.placeInstallHint(width, height, ui);

    bindResizeRestart(this);
    this.events.once("shutdown", () => closeFeedbackForm());
  }

  placeInstallHint(width, height, ui) {
    if (Pwa.isStandalone()) return;
    const y = height - 12 - ui.safe.bottom;
    if (Pwa.canPrompt()) {
      makeButton(
        this,
        16 + ui.safe.left + 70,
        height - 28 - ui.safe.bottom,
        I18n.t("installApp"),
        () => {
          Pwa.promptInstall();
        },
        { width: 140, height: 32, fontSize: 13, fill: COLORS.woodLight, textColor: "#f3e3c3" }
      ).setDepth(10);
      return;
    }
    if (!isCoarsePointer() && width >= 720) return;
    this.add
      .text(16 + ui.safe.left, y, I18n.t("installHint"), {
        fontFamily: FONTS.body,
        fontSize: "12px",
        color: "#c9b08a",
        wordWrap: { width: Math.min(200, width * 0.42) },
      })
      .setOrigin(0, 1)
      .setDepth(10);
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
    const { pw } = panelBox(width, height, 520, 420);
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
    const langs = I18n.available;
    const stack = width < 500;
    const { pw, ph } = panelBox(
      width,
      height,
      440,
      stack ? 320 + langs.length * 58 : 380
    );
    const { items, close } = this.openModal(pw, ph);
    const top = height / 2 - ph / 2;

    items.push(
      this.add
        .text(width / 2, top + 36, I18n.t("settingsTitle"), {
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
        .text(width / 2, top + 78, I18n.t("language"), {
          fontFamily: FONTS.body,
          fontSize: "18px",
          color: "#d9a441",
        })
        .setOrigin(0.5)
        .setDepth(102)
    );

    const totalW = langs.length * 160 + (langs.length - 1) * 20;
    const startX = width / 2 - totalW / 2 + 80;
    langs.forEach((lang, i) => {
      const isCurrent = lang.code === I18n.lang;
      const btnX = stack ? width / 2 : startX + i * 180;
      const btnY = stack ? top + 128 + i * 58 : top + 130;
      const btn = makeButton(
        this,
        btnX,
        btnY,
        lang.label,
        () => {
          if (lang.code !== I18n.lang) {
            I18n.set(lang.code);
            close();
            this.scene.restart();
          }
        },
        {
          width: Math.min(160, pw - 48),
          height: 50,
          fontSize: 18,
          fill: isCurrent ? COLORS.accent : COLORS.woodLight,
          textColor: isCurrent ? "#2c1d14" : "#f3e3c3",
        }
      ).setDepth(102);
      items.push(btn);
    });

    const soundY = stack ? top + 128 + langs.length * 58 : top + 200;
    const soundBtn = makeButton(
      this,
      width / 2,
      soundY,
      Sfx.isMuted() ? I18n.t("soundOff") : I18n.t("soundOn"),
      () => {
        Sfx.toggleMuted();
        soundBtn.setLabel(Sfx.isMuted() ? I18n.t("soundOff") : I18n.t("soundOn"));
      },
      {
        width: Math.min(220, pw - 48),
        height: 50,
        fontSize: 18,
        fill: COLORS.woodLight,
        textColor: "#f3e3c3",
      }
    ).setDepth(102);
    items.push(soundBtn);

    items.push(
      this.add
        .text(width / 2, height / 2 + ph / 2 - 78, I18n.t("appVersion", { version: appVersion() }), {
          fontFamily: FONTS.body,
          fontSize: "15px",
          color: "#c9b08a",
        })
        .setOrigin(0.5)
        .setDepth(102)
    );

    items.push(
      makeButton(this, width / 2, height / 2 + ph / 2 - 36, I18n.t("done"), () => close(), {
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
    const stack = width < 420;
    const { pw, ph } = panelBox(width, height, 440, stack ? 280 : 220);
    const { items, close } = this.openModal(pw, ph);

    items.push(
      this.add
        .text(width / 2, height / 2 - ph / 2 + 44, I18n.t("confirmTitle"), {
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
        .text(width / 2, height / 2 - 8, I18n.t("confirmBody"), {
          fontFamily: FONTS.body,
          fontSize: "16px",
          color: "#d9a441",
          align: "center",
          wordWrap: { width: pw - 48 },
        })
        .setOrigin(0.5)
        .setDepth(102)
    );

    const yesX = stack ? width / 2 : width / 2 - 100;
    const noX = stack ? width / 2 : width / 2 + 100;
    const yesY = stack ? height / 2 + ph / 2 - 86 : height / 2 + 52;
    const noY = stack ? height / 2 + ph / 2 - 28 : height / 2 + 52;

    items.push(
      makeButton(
        this,
        yesX,
        yesY,
        I18n.t("yesReset"),
        () => {
          Storage.clearAll();
          close();
          this.scene.restart();
        },
        { width: Math.min(170, pw - 48), height: 50, fontSize: 18, fill: COLORS.bad, fillHover: 0xa53f3e, textColor: "#ffffff" }
      ).setDepth(102)
    );
    items.push(
      makeButton(this, noX, noY, I18n.t("cancel"), () => close(), {
        width: Math.min(170, pw - 48),
        height: 50,
        fontSize: 18,
        fill: COLORS.woodLight,
        textColor: "#f3e3c3",
      }).setDepth(102)
    );
  }

  drawBackground() {
    fillLibraryRoom(this);
  }
}
