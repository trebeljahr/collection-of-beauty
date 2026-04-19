export type NewsletterIssue = {
  /** ISO week key, e.g. "2026-W17". One issue per week. */
  weekKey: string;
  /** When the issue was sent, ISO 8601 UTC. */
  sentAt: string;
  /** Artwork IDs featured in this issue. These will never be picked again. */
  artworkIds: string[];
  /** Issue number, monotonically increasing. */
  issueNumber: number;
  /** Mailgun message id, for debugging. */
  mailgunId: string | null;
  /** Whether this issue was curated manually or picked randomly. */
  mode: "random" | "manual";
};

export type NewsletterState = {
  /** All issues sent so far, oldest first. */
  issues: NewsletterIssue[];
};

export const EMPTY_STATE: NewsletterState = { issues: [] };
