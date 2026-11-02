import { Column, Row, Section } from "@react-email/components";
import * as React from "react";

void React; // referenced by JSX runtime under classic transform

// <Section> renders a <table>, and a client or webmail viewer that sets
// border-collapse: collapse ignores padding on a table, which leaves the text
// flush with the edge of the email. Padding belongs on the cell.
export function Inset({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <Section>
      <Row>
        <Column className={className}>{children}</Column>
      </Row>
    </Section>
  );
}
