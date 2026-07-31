import { I18n } from "./i18n.js?v=2";
import { Storage } from "./storage.js";
import { appVersion } from "./appInfo.js";

const DEFAULT_FORMSPREE_URL = "https://formspree.io/f/xbdvbarg";
const RECAPTCHA_SCRIPT_ID = "lc-recaptcha-script";
const RECAPTCHA_TIMEOUT_MS = 15000;
const FORMSPREE_TIMEOUT_MS = 20000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label}-timeout`)), ms);
    }),
  ]);
}

function formspreeUrl() {
  return globalThis.LIBRARIAN_CHALLENGE_CONFIG?.formspreeUrl || DEFAULT_FORMSPREE_URL;
}

function recaptchaSiteKey() {
  return globalThis.LIBRARIAN_CHALLENGE_CONFIG?.recaptchaSiteKey?.trim() || "";
}

function resetRecaptchaScript() {
  document.getElementById(RECAPTCHA_SCRIPT_ID)?.remove();
  delete globalThis.grecaptcha;
}

function waitForRecaptchaReady() {
  return new Promise((resolve, reject) => {
    if (globalThis.grecaptcha?.execute) {
      resolve();
      return;
    }
    if (!globalThis.grecaptcha?.ready) {
      reject(new Error("recaptcha-unavailable"));
      return;
    }
    globalThis.grecaptcha.ready(() => {
      if (globalThis.grecaptcha?.execute) resolve();
      else reject(new Error("recaptcha-unavailable"));
    });
  });
}

function recaptchaScriptMatches(siteKey) {
  const script = document.getElementById(RECAPTCHA_SCRIPT_ID);
  if (!script?.src) return false;
  return script.src.includes(encodeURIComponent(siteKey));
}

function loadRecaptchaScript(siteKey) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(RECAPTCHA_SCRIPT_ID);
    if (existing && !recaptchaScriptMatches(siteKey)) {
      resetRecaptchaScript();
    }

    if (globalThis.grecaptcha?.execute && recaptchaScriptMatches(siteKey)) {
      resolve();
      return;
    }

    const scriptEl = document.getElementById(RECAPTCHA_SCRIPT_ID);
    if (scriptEl) {
      waitForRecaptchaReady().then(resolve).catch(reject);
      scriptEl.addEventListener("error", () => reject(new Error("recaptcha-load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = RECAPTCHA_SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.onload = () => waitForRecaptchaReady().then(resolve).catch(reject);
    script.onerror = () => reject(new Error("recaptcha-load"));
    document.head.appendChild(script);
  });
}

async function getRecaptchaToken(siteKey) {
  try {
    return await withTimeout(
      loadRecaptchaScript(siteKey).then(
        () =>
          new Promise((resolve, reject) => {
            globalThis.grecaptcha.execute(siteKey, { action: "submit" }).then(resolve).catch(reject);
          })
      ),
      RECAPTCHA_TIMEOUT_MS,
      "recaptcha"
    );
  } catch (err) {
    resetRecaptchaScript();
    throw err;
  }
}

function captchaErrorMessage(err) {
  const message = err?.message || "";
  const hostname = window.location.hostname;
  if (message.includes("timeout")) return I18n.t("feedbackCaptchaTimeout");
  if (message.includes("Invalid site key")) return I18n.t("feedbackCaptchaInvalidKey", { hostname });
  return I18n.t("feedbackCaptchaHint", { hostname });
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
    appVersion: appVersion(),
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

function renderCaptchaNotice(container) {
  container.replaceChildren();
  container.append(I18n.t("feedbackCaptchaNoticeBefore"), " ");

  const privacyLink = document.createElement("a");
  privacyLink.href = "https://policies.google.com/privacy";
  privacyLink.target = "_blank";
  privacyLink.rel = "noopener noreferrer";
  privacyLink.textContent = I18n.t("feedbackCaptchaPrivacy");

  const termsLink = document.createElement("a");
  termsLink.href = "https://policies.google.com/terms";
  termsLink.target = "_blank";
  termsLink.rel = "noopener noreferrer";
  termsLink.textContent = I18n.t("feedbackCaptchaTerms");

  container.append(
    privacyLink,
    ` ${I18n.t("feedbackCaptchaNoticeMiddle")} `,
    termsLink,
    ` ${I18n.t("feedbackCaptchaNoticeAfter")}`
  );
}

function setRecaptchaActive(active) {
  document.body.classList.toggle("lc-recaptcha-active", active);
}

export function closeFeedbackForm() {
  activeRestore?.();
  activeRestore = null;
  activeOverlay?.remove();
  activeOverlay = null;
  setRecaptchaActive(false);
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

      <p class="lc-feedback-captcha" hidden></p>

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
  const captchaNoticeEl = overlay.querySelector(".lc-feedback-captcha");
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
  } else {
    captchaNoticeEl.hidden = false;
    renderCaptchaNotice(captchaNoticeEl);
    setRecaptchaActive(true);
    loadRecaptchaScript(recaptchaSiteKey()).catch((err) => {
      console.warn("[feedback] recaptcha preload", err);
    });
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
          console.error("[feedback] recaptcha", window.location.hostname, err);
          setStatus(captchaErrorMessage(err), "error");
          setSubmitting(false);
          return;
        }
      }

      const response = await withTimeout(
        fetch(formspreeUrl(), {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(FORMSPREE_TIMEOUT_MS),
        }),
        FORMSPREE_TIMEOUT_MS,
        "formspree"
      );

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
