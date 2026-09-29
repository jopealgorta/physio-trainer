import { expect, it } from "vitest";

import { escapeLike } from "./sql-like";

it("escapes LIKE wildcards and the escape character", () => {
  expect(escapeLike(String.raw`100%_a\b`)).toBe(String.raw`100\%\_a\\b`);
});
