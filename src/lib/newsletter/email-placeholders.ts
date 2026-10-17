/**
 * The API Worker sends emails rendered at build time
 * (scripts/build-api-worker-data.ts), so a link that differs per recipient
 * is a placeholder in the rendered HTML, replaced at send time. Each stands
 * where a token goes: letters and underscores only, so neither React's
 * attribute escaping nor a URL encoder changes it, and the token that
 * replaces it is base64url.
 */
export const CONFIRM_TOKEN_PLACEHOLDER = "COB_CONFIRM_TOKEN_PLACEHOLDER";
export const UNSUBSCRIBE_TOKEN_PLACEHOLDER = "COB_UNSUBSCRIBE_TOKEN_PLACEHOLDER";

/** Replace every placeholder, failing loudly when the template has none. */
export function fillToken(html: string, placeholder: string, token: string): string {
  if (!html.includes(placeholder)) {
    throw new Error(`email template is missing ${placeholder}`);
  }
  return html.split(placeholder).join(encodeURIComponent(token));
}
