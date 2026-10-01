import "server-only";

import { cache } from "react";

import { resolveLink } from "./resolve-link";

/** One lookup per request, shared by `generateMetadata`, the layout, the page and the manifest. */
export const loadLink = cache((code: string) => resolveLink(code));
