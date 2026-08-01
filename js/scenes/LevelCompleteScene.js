import { I18n } from "../utils/i18n.js?v=2";
import { mountScenePanel, domButton } from "../utils/domUi.js";
import { escapeHtml } from "../utils/domOverlay.js";
import { goToScene, COLORS, formatTime } from "../utils/ui.js";

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

    this.add.graphics().fillStyle(COLORS.woodDark, 1).fillRect(0, 0, width, height);

    const { level, totalLevels, timeMs, moves, score, isBest, autoUsed, hintsUsed = 0 } = this.result;
    const hasNext = level < totalLevels;

    this.completeUi = mountScenePanel(this, {
      panelClass: "lc-panel--complete",
      panelWidth: 460,
      buildPanel: (panel) => {
        let noteHtml = "";
        if (autoUsed) {
          noteHtml = `<p class="lc-note lc-note--warn">${escapeHtml(I18n.t("autoUsedNote"))}</p>`;
        } else if (hintsUsed > 0) {
          noteHtml = `<p class="lc-note lc-note--hint">${escapeHtml(I18n.t("hintUsedNote", { count: hintsUsed }))}</p>`;
        } else if (isBest) {
          noteHtml = `<p class="lc-note lc-note--best">${escapeHtml(I18n.t("newBest"))}</p>`;
        }

        const stats = [
          I18n.t("statTime", { time: formatTime(timeMs) }),
          I18n.t("statMoves", { moves }),
          I18n.t("statScore", { score }),
        ].join("\n");

        panel.innerHTML = `
          <h2 class="lc-title">${escapeHtml(I18n.t("levelComplete"))}</h2>
          <p class="lc-kicker">${escapeHtml(I18n.t("levelN", { n: level }))}</p>
          <div class="lc-stat-list">${escapeHtml(stats)}</div>
          ${noteHtml}
          <div class="lc-actions lc-complete-actions"></div>
        `;

        const actions = panel.querySelector(".lc-complete-actions");

        if (hasNext) {
          actions.appendChild(
            domButton(I18n.t("nextLevel"), "lc-btn lc-btn--good lc-btn--wide", () =>
              goToScene(this, "GameScene", { level: level + 1 })
            )
          );
          const row = document.createElement("div");
          row.className = "lc-actions lc-actions--wrap";
          row.style.marginTop = "12px";
          row.appendChild(
            domButton(I18n.t("replay"), "lc-btn lc-btn--wood", () =>
              goToScene(this, "GameScene", { level })
            )
          );
          row.appendChild(
            domButton(I18n.t("levels"), "lc-btn lc-btn--wood", () =>
              goToScene(this, "LevelSelectScene")
            )
          );
          panel.appendChild(row);
        } else {
          panel.insertAdjacentHTML(
            "beforeend",
            `<p class="lc-body lc-body--center lc-body--accent">${escapeHtml(I18n.t("finishedAll"))}</p>`
          );
          const row = document.createElement("div");
          row.className = "lc-actions lc-actions--wrap";
          row.appendChild(
            domButton(I18n.t("replay"), "lc-btn lc-btn--wood", () =>
              goToScene(this, "GameScene", { level })
            )
          );
          row.appendChild(
            domButton(I18n.t("levels"), "lc-btn lc-btn--wood", () =>
              goToScene(this, "LevelSelectScene")
            )
          );
          panel.appendChild(row);
        }
      },
    });

    this.events.once("shutdown", () => this.completeUi?.destroy());
  }
}
