import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocsPage } from "@/components/docs/docs-page";
import {
  DOC_PAGES,
  getDocMeta,
} from "@/lib/docs";

type Props = {
  params: Promise<{
    slug: string[];
  }>;
};

export function generateStaticParams() {
  return DOC_PAGES
    .filter((page) => page.path !== "/docs")
    .map((page) => ({
      slug: page.path.replace(/^\/docs\//, "").split("/"),
    }));
}

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { slug } = await params;
  const path = `/docs/${slug.join("/")}`;
  const meta = getDocMeta(path);

  if (!meta) {
    return {};
  }

  return {
    title: meta.title,
    description: meta.summary,
  };
}

export default async function DocumentationPage({
  params,
}: Props) {
  const { slug } = await params;
  const path = `/docs/${slug.join("/")}`;
  const meta = getDocMeta(path);

  if (!meta) {
    notFound();
  }

  return <DocsPage meta={meta} />;
}
