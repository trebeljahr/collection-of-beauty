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
