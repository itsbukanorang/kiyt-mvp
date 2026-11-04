"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  Menu,
  Search,
  Terminal,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DOC_SEARCH_INDEX,
  DOC_SECTIONS,
} from "@/lib/docs";

function scoreSearch(query: string, haystack: string) {
  const terms = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!terms.length) {
    return 0;
  }

  let score = 0;

  for (const term of terms) {
    const index = haystack.indexOf(term);

    if (index < 0) {
      return -1;
    }

    score += index === 0 ? 8 : 2;
  }

  return score;
}

function DocsNavigation({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="docs-nav" aria-label="Documentation navigation">
      {DOC_SECTIONS.map((section) => (
        <div className="docs-nav-section" key={section.name}>
          <p>{section.name}</p>

          {section.pages.map((page) => {
            const active = pathname === page.path;

            return (
              <Link
                key={page.path}
                href={page.path}
                className={active ? "docs-nav-link active" : "docs-nav-link"}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
              >
                <span>{page.title}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function SearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    if (!query.trim()) {
      return DOC_SEARCH_INDEX.slice(0, 8);
    }

    return DOC_SEARCH_INDEX
      .map((item) => ({
        ...item,
        score: scoreSearch(query, item.search),
      }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [query]);

  useEffect(() => {
    if (open) {
      if (!dialog.current?.open) {
        dialog.current?.showModal();
      }

      requestAnimationFrame(() => input.current?.focus());
      return;
    }

    if (dialog.current?.open) {
      dialog.current.close();
    }
  }, [open]);

  function choose(href: string) {
    onClose();
    setQuery("");
    router.push(href);
  }

  return (
    <dialog
      ref={dialog}
      className="docs-search-dialog"
      aria-label="Search documentation"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <div className="docs-search-box">
        <Search size={18} aria-hidden="true" />
        <input
          ref={input}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          placeholder="Search docs, endpoints, errors..."
          aria-label="Search documentation"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && results.length) {
              event.preventDefault();
              setActive((value) => (value + 1) % results.length);
            }

            if (event.key === "ArrowUp" && results.length) {
              event.preventDefault();
              setActive((value) => (value - 1 + results.length) % results.length);
            }

            if (event.key === "Enter" && results[active]) {
              event.preventDefault();
              choose(results[active].href);
            }

            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
        />
        <kbd>Esc</kbd>
      </div>

      <div className="docs-search-results" role="listbox">
        {results.length ? (
          results.map((item, index) => (
            <button
              type="button"
              key={`${item.href}-${index}`}
              className={active === index ? "active" : ""}
              role="option"
              aria-selected={active === index}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(item.href)}
            >
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          ))
        ) : (
          <div className="docs-search-empty">
            No documentation matches “{query}”.
          </div>
        )}
      </div>
    </dialog>
  );
}

export function DocsShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const navDialog = useRef<HTMLDialogElement>(null);
  const navButton = useRef<HTMLButtonElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (navOpen) {
      if (!navDialog.current?.open) {
        navDialog.current?.showModal();
      }
      return;
    }

    if (navDialog.current?.open) {
      navDialog.current.close();
    }
  }, [navOpen]);

  return (
    <div className="docs-root">
      <a className="docs-skip-link" href="#docs-content">
        Skip to content
      </a>

      <header className="docs-header">
        <div className="docs-header-inner">
          <button
            ref={navButton}
            className="docs-icon-button docs-menu-button"
            type="button"
            aria-label="Open documentation navigation"
            onClick={() => setNavOpen(true)}
          >
            <Menu size={20} />
          </button>

          <Link href="/docs" className="docs-brand" aria-label="KIYT Developers home">
            <img
              src="/dashboard-assets/kiyt-logo.png"
              alt="KIYT"
              width="88"
              height="33"
            />
            <i aria-hidden="true" />
            <span>Developers</span>
          </Link>

          <button
            ref={searchButton}
            type="button"
            className="docs-search-trigger"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={16} aria-hidden="true" />
            <span>Search documentation</span>
            <kbd>⌘K</kbd>
          </button>

          <div className="docs-header-links">
            <Link href="/myaccount">
              Console
            </Link>
            <Link href="/myaccount/playground" className="primary">
              <Terminal size={15} aria-hidden="true" />
              Playground
            </Link>
          </div>
        </div>
      </header>

      <div className="docs-body">
        <aside className="docs-sidebar">
          <DocsNavigation pathname={pathname} />
        </aside>

        <main id="docs-content" className="docs-main" tabIndex={-1}>
          {children}
        </main>
      </div>

      <dialog
        ref={navDialog}
        className="docs-mobile-nav"
        onCancel={() => setNavOpen(false)}
        onClose={() => {
          setNavOpen(false);
          navButton.current?.focus();
        }}
      >
        <div className="docs-mobile-nav-head">
          <Link href="/docs" className="docs-brand" onClick={() => setNavOpen(false)}>
            <img
              src="/dashboard-assets/kiyt-logo.png"
              alt="KIYT"
              width="82"
              height="31"
            />
            <i aria-hidden="true" />
            <span>Developers</span>
          </Link>

          <button
            type="button"
            className="docs-icon-button"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <button
          type="button"
          className="docs-mobile-search"
          onClick={() => {
            setNavOpen(false);
            setSearchOpen(true);
          }}
        >
          <Search size={16} />
          Search documentation
        </button>

        <DocsNavigation
          pathname={pathname}
          onNavigate={() => setNavOpen(false)}
        />
      </dialog>

      <SearchDialog
        open={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          searchButton.current?.focus();
        }}
      />
    </div>
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function highlightedCode(code: string) {
  const pattern =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|#[^\n]*|\b(?:const|let|var|function|async|await|return|if|else|for|while|throw|new|import|from|export|def|try|except|raise|True|False|None|true|false|null|fn|use|mut|match|loop|impl|struct|enum|pub|crate|Some|Ok|Err|move|ref|self|Self)\b|\b\d+(?:\.\d+)?\b|\$[A-Z_][A-Z0-9_]*)/g;

  let output = "";
  let last = 0;

  for (const match of code.matchAll(pattern)) {
    const index = match.index ?? 0;
    const token = match[0];

    output += escapeHtml(code.slice(last, index));

    let className = "token-keyword";

    if (
      token.startsWith('"') ||
      token.startsWith("'") ||
      token.startsWith("`")
    ) {
      className = "token-string";
    } else if (token.startsWith("//") || token.startsWith("#")) {
      className = "token-comment";
    } else if (/^\d/.test(token)) {
      className = "token-number";
    } else if (token.startsWith("$")) {
      className = "token-variable";
    }

    output += `<span class="${className}">${escapeHtml(token)}</span>`;
    last = index + token.length;
  }

  output += escapeHtml(code.slice(last));
  return output;
}

export function CodeTabs({
  examples,
}: {
  examples: {
    label: string;
    language: string;
    code: string;
  }[];
}) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const current = examples[active] ?? examples[0];

  if (!current) {
    return null;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="docs-code">
      <div className="docs-code-toolbar">
        <div className="docs-code-tabs" role="tablist" aria-label="Code language">
          {examples.map((example, index) => (
            <button
              type="button"
              role="tab"
              aria-selected={index === active}
              className={index === active ? "active" : ""}
              key={`${example.label}-${index}`}
              onClick={() => {
                setActive(index);
                setCopied(false);
              }}
            >
              {example.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="docs-copy"
          aria-live="polite"
          onClick={copy}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <pre>
        <code
          data-language={current.language}
          dangerouslySetInnerHTML={{ __html: highlightedCode(current.code) }}
        />
      </pre>
    </div>
  );
}

export function DocsToc({
  headings,
}: {
  headings: { id: string; title: string }[];
}) {
  const [active, setActive] = useState(headings[0]?.id ?? "");

  useEffect(() => {
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (!elements.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]) {
          setActive(visible[0].target.id);
        }
      },
      {
        rootMargin: "-88px 0px -66% 0px",
        threshold: [0, 1],
      },
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [headings]);

  const links = (
    <>
      {headings.map((heading) => (
        <a
          key={heading.id}
          href={`#${heading.id}`}
          className={active === heading.id ? "active" : ""}
        >
          {heading.title}
        </a>
      ))}
    </>
  );

  return (
    <>
      <aside className="docs-toc" aria-label="On this page">
        <p>On this page</p>
        {links}
      </aside>

      <details className="docs-mobile-toc">
        <summary>On this page</summary>
        <div>{links}</div>
      </details>
    </>
  );
}
