import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { BRANDING_BUCKET, LOGO_CONTENT_TYPES } from "@/lib/branding";

import type { LogoStorage } from "./mutations";

/** Logo storage through a user-scoped client, so the bucket's owner-folder policies apply. */
export function supabaseLogoStorage(client: SupabaseClient): LogoStorage {
  const bucket = () => client.storage.from(BRANDING_BUCKET);
  return {
    async upload(path, logo) {
      const { error } = await bucket().upload(path, logo.bytes, {
        contentType: LOGO_CONTENT_TYPES[logo.type],
        cacheControl: "31536000", // paths are never reused
        upsert: false,
      });
      if (error) throw error;
    },
    async remove(paths) {
      const { error } = await bucket().remove(paths);
      if (error) throw error;
    },
  };
}
