/**
 * The pages the app can show.
 *
 * Kept apart from either navigation component because both the step bar and the
 * left-nav name these, and neither owns the list: the steps are the two-stage
 * workflow, the nav is everything the app can reach.
 */
export type Page = 'pgn' | 'analysis' | 'settings'
