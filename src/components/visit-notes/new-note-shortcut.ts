/** True for a bare "N" outside fields and dialogs: the "new note" shortcut. */
export function shouldOpenNewNote(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.repeat) return false;
  if (event.key.toLowerCase() !== "n") return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (target instanceof HTMLElement) {
    if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
      return false;
    }
  }
  return document.querySelector('[role="dialog"], [role="alertdialog"]') === null;
}
