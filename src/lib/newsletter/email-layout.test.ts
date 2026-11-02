import { render } from "@react-email/render";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import AlreadySubscribed from "../../../emails/already-subscribed";
import ConfirmSubscription from "../../../emails/confirm-subscription";
import WeeklyDigest from "../../../emails/weekly-digest";

const TEMPLATES = [
  ["already-subscribed", AlreadySubscribed],
  ["confirm-subscription", ConfirmSubscription],
  ["weekly-digest", WeeklyDigest],
] as const;

describe.each(TEMPLATES)("%s layout", (_name, template) => {
  const html = () => render(createElement(template as React.ComponentType));

  it("has one background behind the text, so no column edge shows beside it", async () => {
    const page = await html();
    const body = page.match(/<body[^>]*background-color:([^;"]+)/)?.[1];
    const column = page.match(/<table[^>]*max-width:\d+px[^>]*background-color:([^;"]+)/)?.[1];
    expect(body).toBeDefined();
    expect(column).toBe(body);
  });

  it("keeps side padding on cells, because a collapsed table ignores its own", async () => {
    const page = await html();
    expect(page).not.toMatch(/<table[^>]*style="[^"]*padding-(left|right):[1-9]/);
    expect(page).toMatch(/<td[^>]*style="[^"]*padding-left:[1-9]/);
  });
});
