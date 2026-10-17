import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const search = { value: new URLSearchParams() };
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search.value,
  useRouter: () => ({ replace }),
}));

const { ConfirmForm } = await import("./confirm-form");
const { default: ConfirmPage } = await import("./page");

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockClear();
});

describe("/sub/confirm", () => {
  it("shows a button that posts the token, and calls nothing to do it", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    search.value = new URLSearchParams({ token: "a+b/c" });

    const html = renderToStaticMarkup(<ConfirmForm />);
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/newsletter/confirm?token=a%2Bb%2Fc"');
    expect(html).toContain('type="submit"');
    expect(renderToStaticMarkup(<ConfirmPage />)).toContain("Nothing has changed yet.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts nothing without a token: the button is disabled until one is read", () => {
    search.value = new URLSearchParams();
    const html = renderToStaticMarkup(<ConfirmForm />);
    expect(html).not.toContain("<form");
    expect(html).toContain("disabled");
  });
});
