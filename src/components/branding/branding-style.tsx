import type { BrandTokens, ModeTokens } from "@/lib/color";

const HEX = /^#[0-9a-f]{6}$/;
const SCOPE = /^[a-z0-9-]+$/;

const declarations = ({ primary, primaryForeground }: ModeTokens) =>
  `--primary:${primary};--primary-foreground:${primaryForeground}`;

/**
 * Physio accent colour for patient-facing surfaces (docs/specs/09-physio-branding.md). Scoped to
 * `[data-brand="<scope>"]`, so the app shell keeps its neutral look. Values are validated again
 * here because they end up inside a <style> element.
 */
export function BrandingStyle({ tokens, scope }: { tokens: BrandTokens | null; scope: string }) {
  if (!tokens || !SCOPE.test(scope)) return null;
  const values = [tokens.light, tokens.dark].flatMap((m) => [m.primary, m.primaryForeground]);
  if (!values.every((value) => HEX.test(value))) return null;
  const selector = `[data-brand="${scope}"]`;
  const css = `${selector}{${declarations(tokens.light)}}.dark ${selector}{${declarations(tokens.dark)}}`;
  return <style>{css}</style>;
}
