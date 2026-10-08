/**
 * Radix Select items cannot have an empty value, so "no selection" options use this stand-in.
 * It contains "#", so it cannot collide with a uuid or an enum value.
 *
 * Radix's internal <select> also reports "" when a controlled value changes in the same commit
 * its option is added. "" is therefore never a real choice: `onValueChange` handlers ignore it.
 */
export const EMPTY_SELECT_VALUE = "#empty";

export const toSelectValue = (value: string) => (value === "" ? EMPTY_SELECT_VALUE : value);
export const fromSelectValue = (value: string) => (value === EMPTY_SELECT_VALUE ? "" : value);
