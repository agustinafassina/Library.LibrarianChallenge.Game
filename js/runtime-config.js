window.LIBRARIAN_CHALLENGE_CONFIG = {
  version: "1.0.0",
  apiBaseUrl: "",
  apiKey: "",
  formspreeUrl: "https://formspree.io/f/xbdvbarg",
  recaptchaSiteKey: "",
  useApiBooks: false,
  maxResultsPerTag: 20,
  autoTag: true,
  bookTags: [
    "Lgbtiq",
    "Queer",
    "Lesbian",
    "Gay",
    "Bisexual",
    "Trans",
    "NonBinary",
    "Intersex",
    "Feminism",
    "Activism"
  ]
};
(function () {
  var siteKey = window.LIBRARIAN_CHALLENGE_CONFIG.recaptchaSiteKey;
  if (!siteKey) return;
  var script = document.createElement("script");
  script.id = "lc-recaptcha-script";
  script.src = "https://www.google.com/recaptcha/api.js?render=" + encodeURIComponent(siteKey);
  script.async = true;
  document.head.appendChild(script);
})();
