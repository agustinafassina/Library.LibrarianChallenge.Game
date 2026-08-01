export const GAME_SIZE = Object.freeze({
  landscape: { width: 960, height: 640 },
  portrait: { width: 640, height: 960 },
});

export function isPortraitViewport(
  width = window.visualViewport?.width ?? window.innerWidth,
  height = window.visualViewport?.height ?? window.innerHeight
) {
  return height > width;
}

export function getViewportSize() {
  return {
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  };
}

export function getGameSize(
  width = window.visualViewport?.width ?? window.innerWidth,
  height = window.visualViewport?.height ?? window.innerHeight
) {
  return isPortraitViewport(width, height) ? GAME_SIZE.portrait : GAME_SIZE.landscape;
}

export function syncOrientationClasses(portrait = isPortraitViewport()) {
  document.body.classList.toggle("lc-portrait", portrait);
  document.body.classList.toggle("lc-landscape", !portrait);
}

export function isPortraitGame(game) {
  return game.scale.height > game.scale.width;
}
