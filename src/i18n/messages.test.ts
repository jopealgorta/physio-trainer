import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

import { locales } from "./config";

type Tree = { [key: string]: string | Tree };

const MESSAGES_DIR = path.join(process.cwd(), "messages");

function load(file: string): Tree {
  return JSON.parse(readFileSync(path.join(MESSAGES_DIR, file), "utf8")) as Tree;
}

/** `{ a: { b: "x" } }` → `{ "a.b": "x" }`. */
function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const id = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result[id] = value;
    else Object.assign(result, flatten(value, id));
  }
  return result;
}

/** Argument names and rich-text tags a message uses, e.g. ["arg:email", "tag:code"]. */
function signature(elements: MessageFormatElement[], out = new Set<string>()): string[] {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        out.add(`arg:${element.value}`);
        break;
      case TYPE.plural:
      case TYPE.select:
        out.add(`arg:${element.value}`);
        for (const option of Object.values(element.options)) signature(option.value, out);
        break;
      case TYPE.tag:
        out.add(`tag:${element.value}`);
        signature(element.children, out);
        break;
    }
  }
  return [...out].sort();
}

const english = flatten(load("en.json"));
const otherFiles = readdirSync(MESSAGES_DIR).filter(
  (file) => file.endsWith(".json") && file !== "en.json",
);

describe("messages", () => {
  it("has at least one translation besides English", () => {
    expect(otherFiles).not.toHaveLength(0);
  });

  it.each(Object.keys(english))("en.json %s is valid ICU", (key) => {
    expect(() => parse(english[key])).not.toThrow();
  });

  describe.each(otherFiles)("%s", (file) => {
    const translated = flatten(load(file));

    it("has exactly the same keys as en.json", () => {
      expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
    });

    it.each(Object.keys(english))(
      "%s is non-empty, valid ICU with en.json's arguments and tags",
      (key) => {
        const message = translated[key];
        expect(message, `missing in ${file}`).toBeTypeOf("string");
        expect(message.trim()).not.toBe("");
        expect(signature(parse(message))).toEqual(signature(parse(english[key])));
      },
    );
  });
});

describe("locales", () => {
  it.each(locales)("%s has a messages file", (locale) => {
    expect(existsSync(path.join(MESSAGES_DIR, `${locale}.json`))).toBe(true);
  });

  it("every messages file is a supported locale", () => {
    const files = readdirSync(MESSAGES_DIR).filter((file) => file.endsWith(".json"));
    expect(files.map((file) => file.replace(/\.json$/, "")).sort()).toEqual([...locales].sort());
  });
});
