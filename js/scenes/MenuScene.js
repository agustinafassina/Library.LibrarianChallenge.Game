import { Storage } from "../utils/storage.js";
import { I18n } from "../utils/i18n.js?v=2";
import { openFeedbackForm, closeFeedbackForm } from "../utils/feedbackForm.js";
import { openDomOverlay, closeDomOverlay, paragraphsFromText, escapeHtml } from "../utils/domOverlay.js";
import { mountSceneUi, domButton } from "../utils/domUi.js";
import { isPortraitGame } from "../config/viewport.js";
import { appVersion } from "../utils/appInfo.js";
import { goToScene, COLORS, FONTS } from "../utils/ui.js";

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super("MenuScene");
  }

  create() {
    const { width, height } = this.scale;
    const portrait = isPortraitGame(this.game);
    Storage.touchSession();
    this.cameras.main.fadeIn(200, 0, 0, 0);

    this.drawBackground();

    if (!portrait) {
      this.add
        .sprite(width * 0.8, height * 0.62, "librarian", "idle")
        .setScale(1.6)
        .setOrigin(0.5)
        .play("librarian-idle");
    }

    this.add
      .text(width / 2, height * (portrait ? 0.14 : 0.2), I18n.t("appTitle"), {
        fontFamily: FONTS.title,
        fontSize: portrait ? "38px" : "52px",
        color: "#f3e3c3",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: width - 40 },
      })
      .setOrigin(0.5)
      .setShadow(0, 4, "#00000088", 6);

    this.add
      .text(width / 2, height * (portrait ? 0.21 : 0.28), I18n.t("subtitle"), {
        fontFamily: FONTS.body,
        fontSize: portrait ? "16px" : "20px",
        color: "#d9a441",
        align: "center",
        wordWrap: { width: width - 48 },
      })
      .setOrigin(0.5);

    this.buildMenuUi();

    this.add
      .text(width - 16, height - 12, I18n.t("appVersion", { version: appVersion() }), {
        fontFamily: FONTS.body,
        fontSize: "14px",
        color: "#c9b08a",
      })
      .setOrigin(1, 1)
      .setDepth(10);

    this.events.once("shutdown", () => {
      this.menuUi?.destroy();
      this.resetUi?.destroy();
      closeFeedbackForm();
      closeDomOverlay();
    });
  }

  buildMenuUi() {
    const hasProgress = Storage.hasProgress();

    const menuLayout = (scene) => {
      const { width, height } = scene.scale;
      const portrait = height > width;
      return {
        x: portrait ? width / 2 : width * 0.34,
        y: height * (portrait ? 0.3 : 0.38),
        width: portrait ? Math.min(300, width - 32) : 240,
        anchor: "top-center",
      };
    };

    this.menuUi = mountSceneUi(this, "lc-menu-ui", menuLayout);

    const ui = this.menuUi.el;
    ui.appendChild(
      domButton(I18n.t("start"), "lc-btn lc-btn--accent lc-btn--primary", () =>
        goToScene(this, "GameScene", { level: 1 })
      )
    );
    ui.appendChild(
      domButton(
        hasProgress ? I18n.t("continueLvl", { level: Storage.getMaxLevelUnlocked() }) : I18n.t("continue"),
        "lc-btn lc-btn--accent lc-btn--primary",
        () => goToScene(this, "GameScene", { level: Storage.getMaxLevelUnlocked() }),
        { disabled: !hasProgress }
      )
    );
    ui.appendChild(
      domButton(I18n.t("levelSelect"), "lc-btn lc-btn--accent lc-btn--primary", () =>
        goToScene(this, "LevelSelectScene")
      )
    );

    const grid = document.createElement("div");
    grid.className = "lc-menu-ui__grid";
    grid.appendChild(
      domButton(I18n.t("tutorial"), "lc-btn lc-btn--wood", () => this.openTutorial())
    );
    grid.appendChild(
      domButton(I18n.t("books"), "lc-btn lc-btn--wood", () => goToScene(this, "BooksScene"))
    );
    grid.appendChild(
      domButton(I18n.t("settings"), "lc-btn lc-btn--wood", () => this.openSettings())
    );
    grid.appendChild(
      domButton(I18n.t("feedback"), "lc-btn lc-btn--wood", () => openFeedbackForm({ scene: this }))
    );
    ui.appendChild(grid);

    this.resetUi = mountSceneUi(this, "lc-scene-ui", (scene) => {
      const { width, height } = scene.scale;
      const portrait = height > width;
      return {
        x: portrait ? width / 2 : width * 0.34,
        y: height - (portrait ? 44 : 52),
        width: portrait ? Math.min(220, width - 32) : 200,
        anchor: "center",
      };
    });
    this.resetUi.el.appendChild(
      domButton(I18n.t("resetProgress"), "lc-btn lc-btn--danger lc-btn--reset", () => this.confirmReset(), {
        disabled: !hasProgress,
      })
    );
  }

  openTutorial() {
    openDomOverlay({
      scene: this,
      panelClass: "lc-panel--tutorial",
      panelWidth: 520,
      buildPanel: (panel, close) => {
        panel.innerHTML = `
          <h2 class="lc-title">${escapeHtml(I18n.t("tutorialTitle"))}</h2>
          <div class="lc-body lc-body--left lc-body--scroll">${paragraphsFromText(I18n.t("tutorialBody"))}</div>
          <div class="lc-actions">
            <button type="button" class="lc-btn lc-btn--wood">${escapeHtml(I18n.t("done"))}</button>
          </div>
        `;
        panel.querySelector("button").addEventListener("click", close);
      },
    });
  }

  openSettings() {
    openDomOverlay({
      scene: this,
      panelClass: "lc-panel--settings",
      panelWidth: 440,
      buildPanel: (panel, close) => {
        const langButtons = I18n.available
          .map(
            (lang) =>
              `<button type="button" class="lc-btn ${lang.code === I18n.lang ? "is-active" : "lc-btn--wood"}" data-lang="${escapeHtml(lang.code)}">${escapeHtml(lang.label)}</button>`
          )
          .join("");

        panel.innerHTML = `
          <h2 class="lc-title">${escapeHtml(I18n.t("settingsTitle"))}</h2>
          <p class="lc-label lc-label--center">${escapeHtml(I18n.t("language"))}</p>
          <div class="lc-actions lc-actions--wrap">${langButtons}</div>
          <p class="lc-muted">${escapeHtml(I18n.t("appVersion", { version: appVersion() }))}</p>
          <div class="lc-actions">
            <button type="button" class="lc-btn lc-btn--wood">${escapeHtml(I18n.t("done"))}</button>
          </div>
        `;

        panel.querySelectorAll("[data-lang]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const code = btn.dataset.lang;
            if (code !== I18n.lang) {
              I18n.set(code);
              close();
              this.scene.restart();
            }
          });
        });

        panel.querySelector(".lc-actions:last-of-type button").addEventListener("click", close);
      },
    });
  }

  confirmReset() {
    openDomOverlay({
      scene: this,
      panelClass: "lc-panel--confirm",
      panelWidth: 440,
      buildPanel: (panel, close) => {
        panel.innerHTML = `
          <h2 class="lc-title">${escapeHtml(I18n.t("confirmTitle"))}</h2>
          <p class="lc-body lc-body--center lc-body--accent">${escapeHtml(I18n.t("confirmBody"))}</p>
          <div class="lc-actions">
            <button type="button" class="lc-btn lc-btn--danger">${escapeHtml(I18n.t("yesReset"))}</button>
            <button type="button" class="lc-btn lc-btn--wood">${escapeHtml(I18n.t("cancel"))}</button>
          </div>
        `;

        const [yesBtn, cancelBtn] = panel.querySelectorAll("button");
        yesBtn.addEventListener("click", () => {
          Storage.clearAll();
          close();
          this.scene.restart();
        });
        cancelBtn.addEventListener("click", close);
      },
    });
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
