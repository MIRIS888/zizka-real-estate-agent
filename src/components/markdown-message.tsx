"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-3 last:mb-0 text-sm leading-7 text-[var(--foreground)]">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--foreground)]">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[var(--foreground)]">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 space-y-1.5 pl-0 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 space-y-1.5 pl-0 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="flex items-start gap-2 text-sm leading-6 text-[var(--foreground)]">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--foreground-muted)]" />
              <span>{children}</span>
            </li>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <pre className="mb-3 overflow-x-auto rounded-lg bg-[var(--surface-muted)] px-4 py-3 text-xs last:mb-0">
                  <code className="text-[var(--foreground)]">{children}</code>
                </pre>
              );
            }
            return (
              <code className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-xs font-mono text-[var(--foreground)]">
                {children}
              </code>
            );
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--primary)] underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-[var(--border-strong)] pl-4 text-sm text-[var(--foreground-muted)] last:mb-0">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-[var(--border)]" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
