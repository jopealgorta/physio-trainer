/** The live region in a form's `FormFooter` ("Saved", "Unsaved changes"...). */
export function formStatus(): HTMLElement {
  const status = document.querySelector<HTMLElement>('[data-slot="form-status"]');
  if (!status) throw new Error("No FormFooter status region on the page");
  return status;
}
