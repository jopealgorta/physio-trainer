/** Whole seconds to show for `ms` left: rounds up, so 0 means the countdown is over. */
export const countdownSeconds = (ms: number) => Math.ceil(Math.max(0, ms) / 1000);

/** "45" under a minute, "1:05" from a minute (digits only, so it needs no translation). */
export function formatCountdown(seconds: number): string {
  if (seconds < 60) return String(seconds);
  const rest = seconds % 60;
  return `${Math.floor(seconds / 60)}:${String(rest).padStart(2, "0")}`;
}
