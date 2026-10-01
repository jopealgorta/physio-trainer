/**
 * Crawlers that fetch a link when it is pasted into a chat or email (WhatsApp, iMessage, Slack,
 * search engines). Opening the patient page that way is not the patient looking at it, so it must
 * not count as an open (spec 10 rule 6).
 */
const LINK_PREVIEW_BOT =
  /bot\b|bot\/|crawler|spider|facebookexternalhit|facebot|whatsapp\/|embedly|preview/i;

export const isLinkPreviewBot = (userAgent: string | null | undefined): boolean =>
  !!userAgent && LINK_PREVIEW_BOT.test(userAgent);
