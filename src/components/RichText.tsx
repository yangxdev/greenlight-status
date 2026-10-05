import type { ReactNode } from 'react';
import { cn } from '../lib/cn.ts';
import { linkClass } from './ui/index.ts';

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (i % 2 === 0) return part;
    if (part.startsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`')) {
      return (
        <code key={i} className="bg-sunken px-1 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(linkClass, 'break-all')}
      >
        {part.replace(/^https?:\/\/(www\.)?/, '')}
      </a>
    );
  });
}

const BULLET = /^\s*[-*]\s+/;
const QUOTE = /^\s*>\s?/;

type Run = { kind: 'list' | 'quote' | 'text'; lines: string[] };

/** A block's lines as runs: consecutive "- " lines become one list, "> " lines one quote, the rest a paragraph. */
function runs(block: string): Run[] {
  const out: Run[] = [];
  for (const line of block.split('\n')) {
    const kind = BULLET.test(line) ? 'list' : QUOTE.test(line) ? 'quote' : 'text';
    const last = out.at(-1);
    if (last && last.kind === kind) last.lines.push(line);
    else out.push({ kind, lines: [line] });
  }
  return out;
}

/**
 * The little markdown GitHub comments and issue forms use: paragraphs, "- " lists, **bold**, `code` and bare links.
 * It builds elements, never HTML, so text from an issue can't inject anything; only http(s) links become links.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text
    .split(/\n{2,}/)
    .filter((b) => b.trim())
    .flatMap(runs);
  return (
    <div className={cn('space-y-3 text-small text-ink-soft', className)}>
      {parts.map((part, i) =>
        part.kind === 'quote' ? (
          <blockquote
            key={i}
            className="border-l-2 border-line-strong pl-3 break-words whitespace-pre-line text-muted"
          >
            {inline(part.lines.map((l) => l.replace(QUOTE, '')).join('\n'))}
          </blockquote>
        ) : part.kind === 'list' ? (
          <ul key={i} className="list-none space-y-1">
            {part.lines.map((l, j) => (
              <li key={j} className="flex gap-2">
                <span aria-hidden="true" className="text-subtle">
                  –
                </span>
                <span className="min-w-0">{inline(l.replace(BULLET, ''))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="break-words whitespace-pre-line">
            {inline(part.lines.join('\n'))}
          </p>
        ),
      )}
    </div>
  );
}
