import { describe, expect, it } from "vitest";

import {
  categoryInputError,
  createCategorySchema,
  exerciseFieldErrors,
  exerciseFormValues,
  exerciseSchema,
} from "./schemas";

const SHORT = "https://youtube.com/shorts/dQw4w9WgXcQ?si=x";
const UUID = "0b0e5a2e-8c1f-4a47-9a55-3f6f1c1f2a10";

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("exerciseSchema", () => {
  it("parses a full form submission", () => {
    const values = exerciseFormValues(
      form([
        ["name", "  Single-leg bridge "],
        ["categoryId", UUID],
        ["instructions", "Push through the heel.\nHold."],
        ["bodyAreas", "knee"],
        ["bodyAreas", "glute"],
        ["bodyAreas", "glute"],
        ["tags", "Bodyweight"],
        ["tags", "beginner"],
        ["media", SHORT],
      ]),
    );
    expect(exerciseSchema.parse(values)).toMatchObject({
      name: "Single-leg bridge",
      categoryId: UUID,
      instructions: "Push through the heel.\nHold.",
      bodyAreas: ["glute", "knee"], // canonical BODY_AREAS order, de-duplicated
      tags: ["bodyweight", "beginner"],
      media: [
        {
          videoId: "dQw4w9WgXcQ",
          isShort: true,
          url: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        },
      ],
    });
  });

  it("ignores prescription fields (exercises no longer carry defaults)", () => {
    const parsed = exerciseSchema.parse(
      exerciseFormValues(
        form([
          ["name", "Plank"],
          ["sets", "abc"],
          ["reps", "12"],
          ["repsMax", "10"],
        ]),
      ),
    );
    expect(parsed).not.toHaveProperty("sets");
    expect(parsed).not.toHaveProperty("reps");
    expect(parsed).not.toHaveProperty("repsMax");
  });

  it("treats blank optional fields as empty", () => {
    expect(
      exerciseSchema.parse(
        exerciseFormValues(
          form([
            ["name", "Plank"],
            ["categoryId", ""],
            ["instructions", "  "],
          ]),
        ),
      ),
    ).toMatchObject({
      categoryId: null,
      instructions: null,
      bodyAreas: [],
      tags: [],
      media: [],
    });
  });

  it.each([
    [[["name", " "]], { name: "nameRequired" }],
    [[["name", "x".repeat(121)]], { name: "nameTooLong" }],
    [
      [
        ["name", "a"],
        ["categoryId", "nope"],
      ],
      { categoryId: "categoryInvalid" },
    ],
    [
      [
        ["name", "a"],
        ["instructions", "x".repeat(5001)],
      ],
      { instructions: "instructionsTooLong" },
    ],
    [
      [
        ["name", "a"],
        ["bodyAreas", "wing"],
      ],
      { bodyAreas: "bodyAreasInvalid" },
    ],
    [
      [
        ["name", "a"],
        ["tags", "x".repeat(31)],
      ],
      { tags: "tagTooLong" },
    ],
    [
      [
        ["name", "a"],
        ...Array.from({ length: 21 }, (_, i) => ["tags", `t${i}`] as [string, string]),
      ],
      { tags: "tooManyTags" },
    ],
    [
      [
        ["name", "a"],
        ["media", "https://vimeo.com/1"],
      ],
      { media: "mediaInvalid" },
    ],
    [
      [["name", "a"], ...Array.from({ length: 11 }, () => ["media", SHORT] as [string, string])],
      { media: "tooManyMedia" },
    ],
  ] as [[string, string][], object][])("maps errors for %j", (entries, expected) => {
    const result = exerciseSchema.safeParse(exerciseFormValues(form(entries)));
    expect(result.success).toBe(false);
    if (!result.success) expect(exerciseFieldErrors(result.error)).toEqual(expected);
  });

  it("rejects duplicate videos", () => {
    const result = exerciseSchema.safeParse(
      exerciseFormValues(
        form([
          ["name", "a"],
          ["media", SHORT],
          ["media", SHORT.replace("?si=x", "")],
        ]),
      ),
    );
    expect(result.success).toBe(false);
    if (!result.success)
      expect(exerciseFieldErrors(result.error)).toEqual({ media: "mediaInvalid" });
  });

  it("ignores File values sent for text fields", () => {
    const data = form([["name", "a"]]);
    data.append("tags", new File(["x"], "x.txt"));
    expect(exerciseSchema.safeParse(exerciseFormValues(data)).success).toBe(false);
  });
});

describe("category schemas", () => {
  it("trims names and maps errors", () => {
    expect(createCategorySchema.parse({ name: "  Glutes ", parentId: null })).toEqual({
      name: "Glutes",
      parentId: null,
    });
    const tooLong = createCategorySchema.safeParse({ name: "x".repeat(61), parentId: null });
    const blank = createCategorySchema.safeParse({ name: " ", parentId: null });
    const badParent = createCategorySchema.safeParse({ name: "a", parentId: "x" });
    expect(!tooLong.success && categoryInputError(tooLong.error)).toBe("nameTooLong");
    expect(!blank.success && categoryInputError(blank.error)).toBe("nameRequired");
    expect(!badParent.success && categoryInputError(badParent.error)).toBe("invalid");
  });
});
