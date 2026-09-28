import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { env } from "@/env";

import { adminClient, signInTestUser } from "./supabase";

describe("Supabase Data API", () => {
  const email = `int-data-api-${crypto.randomUUID()}@example.test`;
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const { data, error } = await adminClient.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    accessToken = await signInTestUser(email);
  });

  afterAll(async () => {
    await adminClient.auth.admin.deleteUser(userId);
  });

  // All table access goes through Drizzle on the server (docs/architecture.md, rule 6).
  it.each(["/rest/v1/physios?select=id", "/rest/v1/"])(
    "refuses %s for a signed-in user",
    async (path) => {
      const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}${path}`, {
        headers: {
          apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      });
      expect(response.ok).toBe(false);
    },
  );

  it("refuses GraphQL", async () => {
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/graphql/v1`, {
      method: "POST",
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    expect(response.ok).toBe(false);
  });
});
