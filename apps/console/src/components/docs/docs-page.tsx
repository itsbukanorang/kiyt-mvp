import fs from "node:fs";
import path from "node:path";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";

import { CodeTabs, DocsToc } from "@/components/docs/docs-shell";
import { DocsSandbox } from "@/components/docs/docs-sandbox";
import {
  getAdjacentDocs,
  type DocMeta,
} from "@/lib/docs";
import {
  DOC_CONTENT,
  type DocBlock,
} from "@/lib/docs-content";

function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\[[^\]]+\]\([^)]+\))/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={index}>{part.slice(1, -1)}</code>;
        }

        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

        if (link) {
          const [, label, href] = link;

          if (href.startsWith("/")) {
            return (
              <Link key={index} href={href}>
                {label}
              </Link>
            );
          }

          return (
            <a key={index} href={href} target="_blank" rel="noreferrer">
              {label}
            </a>
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

function quickstartExamples() {
  const root = path.join(process.cwd(), "public", "docs", "examples");

  const read = (name: string) =>
    fs.readFileSync(path.join(root, name), "utf8").trimEnd();

  return [
    { label: "cURL", language: "bash", code: read("quickstart.sh") },
    { label: "Python", language: "python", code: read("quickstart.py") },
    { label: "Rust", language: "rust", code: read("quickstart.rs") },
    { label: "TypeScript", language: "typescript", code: read("quickstart.ts") },
  ];
}

function Block({ block }: { block: DocBlock }) {
  if (block.type === "paragraph") {
    return (
      <p>
        <RichText text={block.text} />
      </p>
    );
  }

  if (block.type === "bullets") {
    return (
      <ul className="docs-bullets">
        {block.items.map((item) => (
          <li key={item}>
            <RichText text={item} />
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "callout") {
    return (
      <div className={`docs-callout ${block.tone === "warning" ? "warning" : ""}`}>
        <strong>{block.title}</strong>
        <p>
          <RichText text={block.text} />
        </p>
      </div>
    );
  }

  if (block.type === "table") {
    return (
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              {block.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, columnIndex) => (
                  <td key={columnIndex}>
                    <RichText text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.type === "steps") {
    return (
      <ol className="docs-steps">
        {block.items.map((item, index) => (
          <li key={item.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>{item.title}</strong>
              <p>
                <RichText text={item.text} />
              </p>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  if (block.type === "code") {
    return <CodeTabs examples={block.examples} />;
  }

  if (block.type === "sandbox") {
    return <DocsSandbox scenario={block.scenario} />;
  }

  if (block.type === "quickstart-code") {
    return (
      <>
        <CodeTabs examples={quickstartExamples()} />
        <div className="docs-example-downloads">
          <a href="/docs/examples/quickstart.sh" download>
            <Download size={14} />
            quickstart.sh
          </a>
          <a href="/docs/examples/quickstart.py" download>
            <Download size={14} />
            quickstart.py
          </a>
          <a href="/docs/examples/quickstart.rs" download>
            <Download size={14} />
            quickstart.rs
          </a>
          <a href="/docs/examples/quickstart.ts" download>
            <Download size={14} />
            quickstart.ts
          </a>
        </div>
      </>
    );
  }

  if (block.type === "links") {
    return (
      <div className="docs-link-grid">
        {block.items.map((item) => (
          <Link href={item.href} key={item.href}>
            <strong>{item.title}</strong>
            <span>{item.description}</span>
            <ArrowRight size={15} />
          </Link>
        ))}
      </div>
    );
  }

  return null;
}

export function DocsPage({ meta }: { meta: DocMeta }) {
  const content = DOC_CONTENT[meta.path];
  const adjacent = getAdjacentDocs(meta.path);

  if (!content) {
    return null;
  }

  return (
    <div className="docs-article-shell">
      <article className="docs-article">
        <div className="docs-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/docs">Documentation</Link>
          <span>/</span>
          <span>{meta.section}</span>
        </div>

        <header className="docs-article-header">
          <p className="docs-kicker">{meta.section}</p>
          <h1>{meta.title}</h1>
          <p>{meta.summary}</p>
        </header>

        {meta.path === "/docs" && (
          <div className="docs-openapi-strip">
            <div>
              <strong>KIYT Cognitive API</strong>
              <span>HTTPS/JSON · Bearer API key · asynchronous runs</span>
            </div>
            <a href="/docs/openapi.yaml" download>
              <Download size={15} />
              OpenAPI
            </a>
          </div>
        )}

        {content.sections.map((section) => (
          <section id={section.id} key={section.id} className="docs-section">
            <h2>{section.title}</h2>

            {section.blocks.map((block, index) => (
              <Block block={block} key={`${section.id}-${index}`} />
            ))}
          </section>
        ))}

        <nav className="docs-adjacent" aria-label="Previous and next documentation pages">
          {adjacent.previous ? (
            <Link href={adjacent.previous.path}>
              <ArrowLeft size={16} />
              <span>
                <small>Previous</small>
                <strong>{adjacent.previous.title}</strong>
              </span>
            </Link>
          ) : (
            <span />
          )}

          {adjacent.next ? (
            <Link href={adjacent.next.path} className="next">
              <span>
                <small>Next</small>
                <strong>{adjacent.next.title}</strong>
              </span>
              <ArrowRight size={16} />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </article>

      <DocsToc headings={meta.headings} />
    </div>
  );
}
