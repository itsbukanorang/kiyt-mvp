import type { Metadata } from "next";

import { DocsShell } from "@/components/docs/docs-shell";

import "./docs.css";

export const metadata: Metadata = {
  title: {
    default: "KIYT API Documentation",
    template: "%s | KIYT Developers",
  },
  description:
    "Build with KIYT's cognitive decision API: create runs, handle actions and missing input, submit observations, and track usage.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DocsShell>{children}</DocsShell>;
}
