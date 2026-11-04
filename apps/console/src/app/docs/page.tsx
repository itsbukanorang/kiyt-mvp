import { DocsPage } from "@/components/docs/docs-page";
import { getDocMeta } from "@/lib/docs";

export default function DocumentationHome() {
  const meta = getDocMeta("/docs");

  if (!meta) {
    return null;
  }

  return <DocsPage meta={meta} />;
}
