const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** The first link in the newest email to `email`, polling Mailpit for up to 10 seconds. */
export async function latestEmailLink(email: string): Promise<string> {
  const query = encodeURIComponent(`to:"${email}"`);
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = (await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`)).json()) as {
      messages: { ID: string }[];
    };
    if (search.messages.length > 0) {
      const message = (await (
        await fetch(`${MAILPIT_URL}/api/v1/message/${search.messages[0].ID}`)
      ).json()) as { HTML: string };
      const href = message.HTML.match(/href="([^"]+)"/)?.[1];
      if (href) return href.replaceAll("&amp;", "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No sign-in email for ${email}`);
}
