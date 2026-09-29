export type LibraryLayoutState = "empty-page" | "empty-column" | "no-results" | "results";

/** Which body the /library page shows (spec 03 empty-state rules). */
export function libraryLayoutState({
  hasCategories,
  hasExercises,
  hasAnyExercises,
  filtersActive,
}: {
  hasCategories: boolean;
  /** The current list (filtered) has rows. */
  hasExercises: boolean;
  /** The physio owns any exercise at all, archived included. */
  hasAnyExercises: boolean;
  filtersActive: boolean;
}): LibraryLayoutState {
  if (hasExercises) return "results";
  if (filtersActive) return "no-results";
  return hasCategories || hasAnyExercises ? "empty-column" : "empty-page";
}
