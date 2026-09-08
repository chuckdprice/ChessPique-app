/**
 * The pages the app can show.
 *
 * `start` is the way in — the four choices — and `analysis` is everything
 * afterwards, taking the whole screen. There used to be a two-step bar above
 * both, PGN File then Game Analysis, which asked a first-time reader to
 * understand a workflow before the app would show them anything; the left-nav
 * is the only navigation now.
 */
export type Page = 'start' | 'analysis' | 'library' | 'settings'
