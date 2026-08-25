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

    const menu = ui.menu;
    const mascot = this.add
      .sprite(menu.mascotX, menu.mascotY, "librarian", "idle")
      .setScale(menu.mascotScale)
      .setOrigin(0.5, menu.mascotOriginY)
      .play("librarian-idle");

    const title = this.add
      .text(width / 2, menu.titleY, I18n.t("appTitle"), {
        fontFamily: FONTS.title,
        fontSize: `${menu.titleSize}px`,
        color: "#f3e3c3",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: Math.max(160, width - 40) },
      })
      .setOrigin(0.5)
      .setShadow(0, 4, "#00000088", 6);

    const subtitleY = Math.max(menu.subtitleY, Math.round(title.y + title.height / 2 + 10));
    const subtitle = this.add
      .text(width / 2, subtitleY, I18n.t("subtitle"), {
        fontFamily: FONTS.body,
        fontSize: ui.compact || ui.shortLandscape ? "15px" : "20px",
        color: "#d9a441",
        align: "center",
        wordWrap: { width: Math.max(160, width - 40) },
      })
      .setOrigin(0.5);

    const cx = menu.menuCx;
    const btnW = menu.menuBtnW;
    const primaryH = ui.shortLandscape ? 44 : 52;
    const resetH = ui.shortLandscape ? 34 : 40;
    const resetW = Math.min(btnW, Math.round(btnW * 0.86));
    const secW = menu.secW;
    const secH = menu.secH;
    const secGapX = 10;
    const placed = ui.portrait
      ? this.placePortraitButtons(menu, subtitle, primaryH, resetH, secH)
      : {
          y: Math.max(menu.buttonsY, subtitleY + 32),
          gap: menu.gap,
          gapInner: ui.shortLandscape ? 10 : 14,
          gapToSecondary: ui.shortLandscape ? 10 : 18,
          secRowGap: menu.secGapY,
          mascotY: menu.mascotY,
          mascotScale: menu.mascotScale,
        };

    mascot.y = placed.mascotY;
    mascot.setScale(placed.mascotScale);
    mascot.setAlpha(0.92);
    this.tweens.killTweensOf(mascot);
    this.tweens.add({
      targets: mascot,
      y: placed.mascotY - 6,
      angle: 1.2,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    let y = placed.y;
    const gap = placed.gap;
    const gapInner = placed.gapInner ?? 14;

    makeButton(this, cx, y, I18n.t("start"), () => {
      goToScene(this, "GameScene", { level: 1 });
    }, { width: btnW, height: primaryH });

    const hasProgress = Storage.hasProgress();
    y += gap;
    makeButton(
      this,
      cx,
      y,
      hasProgress ? I18n.t("continueLvl", { level: Storage.getMaxLevelUnlocked() }) : I18n.t("continue"),
      () => goToScene(this, "GameScene", { level: Storage.getMaxLevelUnlocked() }),
      { enabled: hasProgress, width: btnW, height: primaryH }
    );

    y += gap;
    makeButton(this, cx, y, I18n.t("levelSelect"), () => {
      goToScene(this, "LevelSelectScene");
    }, { width: btnW, height: primaryH });

    y += primaryH / 2 + gapInner + resetH / 2;
    makeButton(this, cx, y, I18n.t("resetProgress"), () => this.confirmReset(), {
      width: resetW,
      height: resetH,
      fontSize: 15,
      fill: COLORS.bad,
      fillHover: 0xa53f3e,
      textColor: "#ffffff",
      enabled: hasProgress,
    });

    y += resetH / 2 + placed.gapToSecondary + secH / 2;
    const secFont = ui.shortLandscape ? 13 : 14;
    const secOpts = { width: secW, height: secH, fontSize: secFont, fill: COLORS.woodLight, textColor: "#f3e3c3" };
    const secRow1Y = y;
    const secRow2Y = y + secH + (placed.secRowGap ?? menu.secGapY);

    makeButton(this, cx - secW / 2 - secGapX / 2, secRow1Y, I18n.t("tutorial"), () => this.openTutorial(), secOpts);
    makeButton(this, cx + secW / 2 + secGapX / 2, secRow1Y, I18n.t("books"), () => goToScene(this, "BooksScene"), secOpts);
    makeButton(this, cx - secW / 2 - secGapX / 2, secRow2Y, I18n.t("settings"), () => this.openSettings(), secOpts);
    makeButton(this, cx + secW / 2 + secGapX / 2, secRow2Y, I18n.t("feedback"), () => openFeedbackForm({ scene: this }), secOpts);

    this.add
      .text(width - 16 - ui.safe.right, menu.versionY, I18n.t("appVersion", { version: appVersion() }), {
        fontFamily: FONTS.body,
        fontSize: "14px",
        color: "#c9b08a",
      })
      .setOrigin(1, 1)
      .setDepth(10);

    this.placeInstallHint(width, ui, menu);

    bindResizeRestart(this);
    this.events.once("shutdown", () => closeFeedbackForm());
  }

  placePortraitButtons(menu, subtitle, primaryH, resetH, secH) {
    const subtitleBottom = subtitle.y + subtitle.height / 2;
    const availableTop = subtitleBottom + 20;
    const footerTop = menu.versionY - 10;
    let mascotScale = menu.mascotScale;
    let mascotH = 320 * mascotScale;
    const mascotY = footerTop - 2;
    let contentBottom = mascotY - mascotH * 0.55 - 12;

    const itemsH = 3 * primaryH + resetH + 2 * secH;
    const minGap = 14;
    const maxGap = 22;
    const spaces = 7;
    let innerH = contentBottom - availableTop;

    if (innerH < itemsH + minGap * spaces) {
      mascotScale = Math.max(0.26, mascotScale * 0.75);
      mascotH = 320 * mascotScale;
      contentBottom = mascotY - mascotH * 0.5 - 10;
      innerH = contentBottom - availableTop;
    }

    const free = Math.max(0, innerH - itemsH);
    const even = Math.min(maxGap, Math.max(minGap, free / spaces));
    const used = itemsH + even * spaces;
    const leftover = Math.max(0, innerH - used);
    const lead = even + leftover * 0.42;
    const y = Math.round(availableTop + lead + primaryH / 2);

    return {
      y,
      gap: primaryH + even,
      gapInner: even,
      gapToSecondary: even + 4,
      secRowGap: even,
      mascotY: Math.round(mascotY),
      mascotScale,
    };
  }

  placeInstallHint(width, ui, menu) {
    if (Pwa.isStandalone()) return;
    const hintLeft = 16 + ui.safe.left;
    const hintY = menu.versionY;

    if (Pwa.canPrompt()) {
      makeButton(
        this,
        hintLeft + 70,
        hintY - 6,
        I18n.t("installApp"),
        () => {
          Pwa.promptInstall();
        },
        { width: 140, height: 32, fontSize: 13, fill: COLORS.woodLight, textColor: "#f3e3c3" }
      ).setDepth(10);
      return;
    }
    if (!isCoarsePointer() && width >= 720 && !ui.shortLandscape) return;
    this.add
      .text(hintLeft, hintY, I18n.t("installHint"), {
        fontFamily: FONTS.body,
        fontSize: "12px",
        color: "#c9b08a",
        wordWrap: { width: Math.min(220, width * 0.55) },
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
