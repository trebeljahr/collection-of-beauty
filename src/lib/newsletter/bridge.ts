/** Project-only bridge access. Shared Listmonk/database credentials never enter the app. */
export async function legacyBridge(
  action: "prepare" | "confirm",
  token?: string,
): Promise<boolean> {
  const raw = process.env.NEWSLETTER_BRIDGE_URL;
  const required = process.env.LISTMONK_MESSENGER === "project-ses";
  if (!raw) {
    if (required) throw new Error("Newsletter migration bridge is required.");
    return false;
  }
  if (process.env.NEWSLETTER_WRITES_PAUSED === "true")
    throw new Error("Newsletter writes are paused for migration.");
  const url = new URL(raw);
  const password = process.env.NEWSLETTER_BRIDGE_PASSWORD;
  const role = process.env.NEWSLETTER_BRIDGE_LIST_ROLE;
  if (
    url.protocol !== "https:" ||
    url.origin !== raw ||
    raw !== process.env.LISTMONK_URL?.replace(/\/$/, "") ||
    !password ||
    password.length < 32 ||
    !["live", "test"].includes(role ?? "") ||
    !token
  ) {
    throw new Error("Newsletter bridge configuration or confirmation token is invalid.");
  }
  const response = await fetch(`${url.origin}/bridge/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`project-app:${password}`).toString("base64")}`,
    },
    body: JSON.stringify({ token, role }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Newsletter confirmation is held for reconciliation.");
  return true;
}
