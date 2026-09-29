export type LibraryLayoutState = "empty-page" | "empty-column" | "no-results" | "results";

/** Which body the /library page shows (spec 03 empty-state rules). */
export function libraryLayoutState({
  hasCategories,
  hasExercises,
  filtersActive,
}: {
  hasCategories: boolean;
  hasExercises: boolean;
  filtersActive: boolean;
}): LibraryLayoutState {
  if (hasExercises) return "results";
  if (filtersActive) return "no-results";
  return hasCategories ? "empty-column" : "empty-page";
}
