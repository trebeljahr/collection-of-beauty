import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

/**
 * Render a markdown string to plain HTML. Used by the email render path
 * (the website uses react-markdown directly via the React component).
 *
 * The pipeline intentionally skips raw HTML — newsletter bodies are
 * trusted (they come from the repo) but we still keep the output
 * conservative so it renders the same in Gmail, Apple Mail, and Outlook.
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);
  return String(file);
}

// Mail clients (Gmail, Outlook) commonly drop or partially honour
// <style> blocks in <head>, and iOS Mail aggressively recolors <a>
// tags to system blue when no inline color is set. Inlining the link
// style directly on every <a> defeats both: the rule travels with the
// element and survives <style>-stripping clients. The wrapped <span>
// with `color: inherit` is the standard trick to defeat iOS Mail's
// auto-recolor on the link text itself.
const EMAIL_LINK_STYLE =
  "color:#1c1917;text-decoration-line:underline;text-decoration-color:#d6d3d1;text-underline-offset:4px";

export function inlineEmailLinkStyles(html: string): string {
  return html
    .replace(/<a\b/g, `<a style="${EMAIL_LINK_STYLE}"`)
    .replace(/(<a\b[^>]*>)([\s\S]*?)(<\/a>)/g, (_m, open, inner, close) => {
      return `${open}<span style="color:#1c1917">${inner}</span>${close}`;
    });
}
