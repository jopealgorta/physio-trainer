/** Only phone-like text (digits, spaces, + ( ) . -) may become a link. */
const PHONE_LIKE = /^[\d\s+().-]+$/;
const INTERNATIONAL = /^\s*(\+|00)/;

/** `tel:` link built only from digits (and a leading +); null when the text is not phone-like. */
export function telHref(phone: string): string | null {
  if (!PHONE_LIKE.test(phone)) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return `tel:${phone.trim().startsWith("+") ? "+" : ""}${digits}`;
}

/** wa.me link for an international number (`+…` or `00…`, 7–15 digits); null otherwise. */
export function whatsappHref(phone: string): string | null {
  if (!PHONE_LIKE.test(phone) || !INTERNATIONAL.test(phone)) return null;
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  return digits.length >= 7 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}
