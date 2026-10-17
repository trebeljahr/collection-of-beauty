import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const search = { value: new URLSearchParams() };
vi.mock("next/navigation", () => ({ useSearchParams: () => search.value }));

const { UnsubscribeBody } = await import("./unsubscribe-body");

const render = (query: Record<string, string>) => {
  search.value = new URLSearchParams(query);
  return renderToStaticMarkup(<UnsubscribeBody />);
};

describe("/sub/unsubscribe", () => {
  it("shows a button that posts the token", () => {
    const html = render({ token: "a+b/c" });
    expect(html).toContain('action="/api/newsletter/unsubscribe?token=a%2Bb%2Fc"');
    expect(html).toContain('type="submit"');
  });

  it("says when it is done, and when the link is broken, with no button", () => {
    expect(render({ done: "1" })).toContain("You&#x27;re unsubscribed.");
    const broken = render({ invalid: "1" });
    expect(broken).toContain("This unsubscribe link is broken.");
    expect(broken).not.toContain("<form");
  });

  it("keeps the button after a failure", () => {
    const html = render({ token: "t", failed: "1" });
    expect(html).toContain("still on the list");
    expect(html).toContain("<form");
  });
});
