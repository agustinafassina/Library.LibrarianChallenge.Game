import { I18n } from "./i18n.js?v=2";
import { Storage } from "./storage.js";

const DEFAULT_FORMSPREE_URL = "https://formspree.io/f/xbdvbarg";
const RECAPTCHA_SCRIPT_ID = "lc-recaptcha-script";

function formspreeUrl() {
  return globalThis.LIBRARIAN_CHALLENGE_CONFIG?.formspreeUrl || DEFAULT_FORMSPREE_URL;
}

function recaptchaSiteKey() {
  return globalThis.LIBRARIAN_CHALLENGE_CONFIG?.recaptchaSiteKey?.trim() || "";
}

function loadRecaptchaScript(siteKey) {
  return new Promise((resolve, reject) => {
    if (globalThis.grecaptcha?.execute) {
      resolve();
      return;
    }

    const existing = document.getElementById(RECAPTCHA_SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("recaptcha-load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = RECAPTCHA_SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("recaptcha-load"));
    document.head.appendChild(script);
  });
}

function getRecaptchaToken(siteKey) {
  return loadRecaptchaScript(siteKey).then(
    () =>
      new Promise((resolve, reject) => {
        globalThis.grecaptcha.ready(() => {
          globalThis.grecaptcha.execute(siteKey, { action: "submit" }).then(resolve).catch(reject);
        });
      })
  );
}

function feedbackTypes() {
  return [
    { value: "bug", label: I18n.t("feedbackTypeBug") },
    { value: "idea", label: I18n.t("feedbackTypeIdea") },
    { value: "ux", label: I18n.t("feedbackTypeUx") },
    { value: "other", label: I18n.t("feedbackTypeOther") },
  ];
}

function buildMetadata() {
  const profile = Storage.getGuestProfile();
  const stats = Storage.getGlobalStats();
  return {
    guestId: profile.id,
    language: I18n.lang,
    scene: "MenuScene",
    maxLevelUnlocked: Storage.getMaxLevelUnlocked(),
    completedLevels: (stats.completedLevels ?? []).length,
    userAgent: navigator.userAgent,
    screenSize: `${window.innerWidth}x${window.innerHeight}`,
    submittedAt: new Date().toISOString(),
  };
}

let activeOverlay = null;
let activeRestore = null;

function blockGameInput(scene) {
  const canvas = document.querySelector("#game-container canvas");
  const container = document.getElementById("game-container");
  if (scene?.input) scene.input.enabled = false;
  if (canvas) canvas.style.pointerEvents = "none";
  container?.classList.add("lc-feedback-open");

  return () => {
    if (scene?.input) scene.input.enabled = true;
    if (canvas) canvas.style.pointerEvents = "";
    container?.classList.remove("lc-feedback-open");
  };
}

function stopPointerPropagation(event) {
  event.stopPropagation();
}

export function closeFeedbackForm() {
  activeRestore?.();
  activeRestore = null;
  activeOverlay?.remove();
  activeOverlay = null;
}

export function openFeedbackForm({ scene } = {}) {
  closeFeedbackForm();
  activeRestore = blockGameInput(scene);

  const overlay = document.createElement("div");
  overlay.id = "lc-feedback-overlay";
  overlay.innerHTML = `
    <form class="lc-feedback-panel" novalidate>
      <h2 class="lc-feedback-title"></h2>
      <p class="lc-feedback-subtitle"></p>
      <p class="lc-feedback-privacy"></p>

      <label class="lc-feedback-label lc-feedback-type-label"></label>
      <select name="type" class="lc-feedback-select"></select>

      <label class="lc-feedback-label lc-feedback-message-label"></label>
      <textarea
        name="message"
        class="lc-feedback-textarea"
        rows="5"
        required
      ></textarea>

      <label class="lc-feedback-label lc-feedback-email-label"></label>
      <input type="email" name="email" class="lc-feedback-input" autocomplete="email" required />

      <input type="text" name="_gotcha" class="lc-feedback-honeypot" tabindex="-1" autocomplete="off" />

      <p class="lc-feedback-status" aria-live="polite"></p>

      <div class="lc-feedback-actions">
        <button type="button" class="lc-feedback-btn lc-feedback-cancel"></button>
        <button type="submit" class="lc-feedback-btn lc-feedback-submit"></button>
      </div>
    </form>
  `;

  const form = overlay.querySelector("form");
  const title = overlay.querySelector(".lc-feedback-title");
  const subtitle = overlay.querySelector(".lc-feedback-subtitle");
  const privacy = overlay.querySelector(".lc-feedback-privacy");
  const typeLabel = overlay.querySelector(".lc-feedback-type-label");
  const messageLabel = overlay.querySelector(".lc-feedback-message-label");
  const emailLabel = overlay.querySelector(".lc-feedback-email-label");
  const typeSelect = overlay.querySelector('select[name="type"]');
  const messageInput = overlay.querySelector('textarea[name="message"]');
  const emailInput = overlay.querySelector('input[name="email"]');
  const statusEl = overlay.querySelector(".lc-feedback-status");
  const cancelBtn = overlay.querySelector(".lc-feedback-cancel");
  const submitBtn = overlay.querySelector(".lc-feedback-submit");

  title.textContent = I18n.t("feedbackTitle");
  subtitle.textContent = I18n.t("feedbackSubtitle");
  privacy.textContent = I18n.t("feedbackPrivacy");
  typeLabel.textContent = I18n.t("feedbackType");
  messageLabel.textContent = I18n.t("feedbackMessage");
  emailLabel.textContent = I18n.t("feedbackEmail");
  messageInput.placeholder = I18n.t("feedbackMessagePlaceholder");
  emailInput.placeholder = I18n.t("feedbackEmailPlaceholder");
  cancelBtn.textContent = I18n.t("cancel");
  submitBtn.textContent = I18n.t("feedbackSend");

  if (!recaptchaSiteKey()) {
    console.warn(
      "[feedback] recaptchaSiteKey is empty. Enable reCAPTCHA v3 in Formspree and set the site key in js/runtime-config.js before public deploy."
    );
  }

  feedbackTypes().forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    typeSelect.appendChild(option);
  });

  const setStatus = (text, kind = "") => {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
  };

  const setSubmitting = (submitting) => {
    submitBtn.disabled = submitting;
    cancelBtn.disabled = submitting;
    typeSelect.disabled = submitting;
    messageInput.disabled = submitting;
    emailInput.disabled = submitting;
  };

  cancelBtn.addEventListener("click", () => closeFeedbackForm());

  for (const el of [form, typeSelect, messageInput, emailInput]) {
    el.addEventListener("pointerdown", stopPointerPropagation);
    el.addEventListener("mousedown", stopPointerPropagation);
    el.addEventListener("click", stopPointerPropagation);
    el.addEventListener("touchstart", stopPointerPropagation, { passive: true });
  }

  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) closeFeedbackForm();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = messageInput.value.trim();
    if (!message) {
      setStatus(I18n.t("feedbackMessageRequired"), "error");
      messageInput.focus();
      return;
    }

    const email = emailInput.value.trim();
    if (!email) {
      setStatus(I18n.t("feedbackEmailRequired"), "error");
      emailInput.focus();
      return;
    }
    if (!emailInput.checkValidity()) {
      setStatus(I18n.t("feedbackEmailInvalid"), "error");
      emailInput.focus();
      return;
    }

    const meta = buildMetadata();
    const payload = {
      _subject: `Librarian's Challenge feedback (${typeSelect.value})`,
      type: typeSelect.value,
      message,
      email,
      ...meta,
    };

    setSubmitting(true);
    setStatus(I18n.t("feedbackSending"), "info");

    try {
      const siteKey = recaptchaSiteKey();
      if (siteKey) {
        try {
          payload["g-recaptcha-response"] = await getRecaptchaToken(siteKey);
        } catch (err) {
          console.error("[feedback] recaptcha", err);
          setStatus(I18n.t("feedbackCaptchaError"), "error");
          setSubmitting(false);
          return;
        }
      }

      const response = await fetch(formspreeUrl(), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || I18n.t("feedbackError"));
      }

      setStatus(I18n.t("feedbackSuccess"), "success");
      submitBtn.textContent = I18n.t("done");
      submitBtn.disabled = true;
      cancelBtn.disabled = false;
      cancelBtn.textContent = I18n.t("done");
      cancelBtn.onclick = () => closeFeedbackForm();
    } catch (err) {
      console.error("[feedback]", err);
      setStatus(I18n.t("feedbackError"), "error");
      setSubmitting(false);
    }
  });

  document.getElementById("game-container")?.appendChild(overlay);
  activeOverlay = overlay;
  messageInput.focus();
}
