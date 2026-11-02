import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConfirmPage from "./page";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/sub/confirm", () => {
  it("shows a button that posts the token, and calls nothing to do it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const html = renderToStaticMarkup(
      await ConfirmPage({ searchParams: Promise.resolve({ token: "a+b/c" }) }),
    );

    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/newsletter/confirm?token=a%2Bb%2Fc"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("Nothing has changed yet.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a link with no token to the error page", async () => {
    await expect(ConfirmPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });
});
