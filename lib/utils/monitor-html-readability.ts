/**
 * Readability helpers for HTML snapshot text in the diff viewer (text only; no innerHTML).
 */

export function extractHtmlTitleAndTextPreview(html: string): {
  title: string | null;
  textPreview: string;
} {
  const titleMatch = html.match(/<title[^>]*>([^<]{0,240})<\/title>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/\s+/g, " ").trim().slice(0, 200) || null
    : null;
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = stripped
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
  return { title, textPreview: text };
}

/** Break minified HTML into multiple lines for scanning (safe string transform). */
export function breakLongHtmlLines(text: string): string {
  if (text.length < 400) return text;
  const newlineCount = (text.match(/\n/g) ?? []).length;
  if (newlineCount > 8) return text;
  return text.replace(/></g, ">\n<");
}
