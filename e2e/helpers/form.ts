import type { Locator, Page } from "@playwright/test";

/** The live region in a form's pinned footer ("Saved", "Unsaved changes"...). */
export const formStatus = (scope: Page | Locator) => scope.locator('[data-slot="form-status"]');
