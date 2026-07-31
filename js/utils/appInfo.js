export function appVersion() {
  const version = globalThis.LIBRARIAN_CHALLENGE_CONFIG?.version;
  if (version === undefined || version === null || String(version).trim() === "") {
    return "dev";
  }
  return String(version).trim();
}

export function appVersionLabel() {
  return `v${appVersion()}`;
}
