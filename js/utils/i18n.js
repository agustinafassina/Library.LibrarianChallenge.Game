const KEY_LANG = "librarians-challenge:lang";

const STRINGS = {
  en: {
    appTitle: "Librarian's Challenge",
    subtitle: "Restore order to the library, shelf by shelf.",
    start: "Start Game",
    continue: "Continue",
    continueLvl: "Continue (Lvl {level})",
    levelSelect: "Level Select",
    settings: "Settings",
    resetProgress: "Reset Progress",
    tip: "Tip: drag books into order. Press R in-game to reset a level.",
    confirmTitle: "Start from scratch?",
    confirmBody: "This erases your unlocked levels and best scores.",
    yesReset: "Yes, reset",
    cancel: "Cancel",
    settingsTitle: "Settings",
    language: "Language",
    done: "Done",
    back: "\u2190 Menu",
    loadingLevels: "Loading levels...",
    levelsError: "Could not load levels.\nRun the game from a local server.",
    levelN: "Level {n}",
    lockedN: "\uD83D\uDD12 {n}",
    notPlayed: "Not played",
    best: "Best: {score} \u2022 {time}",
    timeLabel: "Time {time}",
    movesLabel: "Moves {moves}",
    levelProgress: "Level {level} / {total}",
    resetR: "Reset (R)",
    menu: "Menu",
    ruleColon: "Rule: {label}",
    checkOrder: "Check Order",
    autoArrange: "Auto-arrange",
    errorsOnPage: "Also errors on page {pages}",
    autoConfirmTitle: "Use Auto-arrange?",
    autoConfirmBody: "The books will be arranged for you,\nbut your score will be capped at 100.",
    autoConfirmYes: "Yes, arrange",
    autoUsedNote: "Score capped \u2014 Auto-arrange was used.",
    pageIndicator: "Page {page} / {total}",
    loadingLevel: "Loading level...",
    levelDataError: "Could not load level data.\nServe the folder over HTTP (see README).",
    levelNotFound: "Level {level} not found.",
    levelComplete: "Level Complete!",
    statTime: "Time:   {time}",
    statMoves: "Moves:  {moves}",
    statScore: "Score:  {score}",
    newBest: "\u2605 New best! \u2605",
    nextLevel: "Next Level \u2192",
    finishedAll: "You finished every level. Bravo, librarian!",
    replay: "Replay",
    levels: "Levels",
    rule_title_az: "Title A\u2013Z",
    rule_author_az: "Author A\u2013Z",
    rule_genre_az: "Genre A\u2013Z",
    rule_year_asc: "Year (oldest first)",
    rule_genre_then_title: "Genre A\u2013Z, then Title A\u2013Z",
  },

  es: {
    appTitle: "El Desaf\u00edo del Bibliotecario",
    subtitle: "Devolv\u00e9 el orden a la biblioteca, estante por estante.",
    start: "Empezar",
    continue: "Continuar",
    continueLvl: "Continuar (Nivel {level})",
    levelSelect: "Elegir nivel",
    settings: "Ajustes",
    resetProgress: "Reiniciar progreso",
    tip: "Tip: arrastr\u00e1 los libros para ordenarlos. Apret\u00e1 R para reiniciar un nivel.",
    confirmTitle: "\u00bfEmpezar de cero?",
    confirmBody: "Esto borra los niveles desbloqueados y tus mejores puntajes.",
    yesReset: "S\u00ed, reiniciar",
    cancel: "Cancelar",
    settingsTitle: "Ajustes",
    language: "Idioma",
    done: "Listo",
    back: "\u2190 Men\u00fa",
    loadingLevels: "Cargando niveles...",
    levelsError: "No se pudieron cargar los niveles.\nEjecut\u00e1 el juego desde un servidor local.",
    levelN: "Nivel {n}",
    lockedN: "\uD83D\uDD12 {n}",
    notPlayed: "Sin jugar",
    best: "Mejor: {score} \u2022 {time}",
    timeLabel: "Tiempo {time}",
    movesLabel: "Movidas {moves}",
    levelProgress: "Nivel {level} / {total}",
    resetR: "Reiniciar (R)",
    menu: "Men\u00fa",
    ruleColon: "Regla: {label}",
    checkOrder: "Comprobar orden",
    autoArrange: "Organizar solos",
    errorsOnPage: "Tambi\u00e9n hay errores en p\u00e1gina {pages}",
    autoConfirmTitle: "\u00bfOrganizar solos?",
    autoConfirmBody: "Los libros se van a acomodar por vos,\npero tu puntaje quedará en 100 como máximo.",
    autoConfirmYes: "S\u00ed, organizar",
    autoUsedNote: "Puntaje limitado \u2014 se us\u00f3 Organizar solos.",
    pageIndicator: "P\u00e1gina {page} / {total}",
    loadingLevel: "Cargando nivel...",
    levelDataError: "No se pudieron cargar los datos.\nServ\u00ed la carpeta por HTTP (ver README).",
    levelNotFound: "Nivel {level} no encontrado.",
    levelComplete: "\u00a1Nivel completado!",
    statTime: "Tiempo:  {time}",
    statMoves: "Movidas: {moves}",
    statScore: "Puntaje: {score}",
    newBest: "\u2605 \u00a1Nuevo r\u00e9cord! \u2605",
    nextLevel: "Siguiente nivel \u2192",
    finishedAll: "\u00a1Completaste todos los niveles. Bravo!",
    replay: "Reintentar",
    levels: "Niveles",
    rule_title_az: "T\u00edtulo A\u2013Z",
    rule_author_az: "Autor A\u2013Z",
    rule_genre_az: "G\u00e9nero A\u2013Z",
    rule_year_asc: "A\u00f1o (m\u00e1s viejo primero)",
    rule_genre_then_title: "G\u00e9nero A\u2013Z, luego T\u00edtulo A\u2013Z",
  },
};

function readLang() {
  const saved = localStorage.getItem(KEY_LANG);
  return saved && STRINGS[saved] ? saved : "en";
}

let current = readLang();

export const I18n = {
  available: [
    { code: "en", label: "English" },
    { code: "es", label: "Espa\u00f1ol" },
  ],

  get lang() {
    return current;
  },

  set(lang) {
    if (!STRINGS[lang]) return;
    current = lang;
    localStorage.setItem(KEY_LANG, lang);
  },

  pick(obj, field) {
    if (!obj) return "";
    return obj[`${field}_${current}`] ?? obj[field] ?? "";
  },

  t(key, params = {}) {
    const table = STRINGS[current] || STRINGS.en;
    let str = table[key] ?? STRINGS.en[key] ?? key;
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
    return str;
  },
};