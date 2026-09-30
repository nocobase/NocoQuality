import { useTranslation } from '@nocobase/i18n/client';
import type { ReactNode } from 'react';
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock3,
  LoaderCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Tone } from './model.js';

const executionMeta: Record<string, [Tone, typeof Clock3]> = {
  pending_dispatch: ['muted', Clock3],
  running: ['primary', LoaderCircle],
  completed: ['good', CircleCheck],
  failed: ['bad', CircleX],
};
const resultMeta: Record<string, [Tone, typeof Clock3]> = {
  not_run: ['muted', CircleDashed],
  passed: ['good', CircleCheck],
  failed: ['bad', CircleX],
};

export function StatusBadge({
  kind,
  value,
}: {
  kind: 'execution' | 'result';
  value: string;
}) {
  const { t } = useTranslation();
  const [tone, Icon] = (kind === 'execution' ? executionMeta : resultMeta)[
    value
  ] || ['muted', CircleDashed];
  return (
    <Badge variant='outline' className={'qc-tone qc-tone-' + tone}>
      <Icon />
      {t(
        'qc.' +
          (kind === 'execution' ? 'executionStatus.' : 'resultStatus.') +
          value,
      )}
    </Badge>
  );
}

export function SectionTitle({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className='flex flex-wrap items-start justify-between gap-3'>
      <div className='flex min-w-0 items-start gap-3'>
        {icon && (
          <span className='qc-icon-tile mt-0.5 shrink-0 rounded-lg p-2 [&_svg]:size-4'>
            {icon}
          </span>
        )}
        <div className='min-w-0'>
          <h2 className='font-semibold'>{title}</h2>
          {description && (
            <p className='mt-1 text-xs leading-5 text-muted-foreground'>
              {description}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

// Renders the small Markdown subset that execution reports use: headings, lists and paragraphs, as plain text.
// Renders **bold** and `code` spans inside one line; everything else stays plain text.
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} className='font-semibold text-foreground'>
            {part.slice(2, -2)}
          </strong>
        ) : part.startsWith('`') && part.endsWith('`') ? (
          <code
            key={i}
            className='rounded bg-muted px-1 font-mono text-[0.85em]'
          >
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function ReportText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length)
      blocks.push(
        <p key={blocks.length} className='text-sm leading-7'>
          <Inline text={paragraph.join('\n')} />
        </p>,
      );
    paragraph = [];
  };
  const flushList = () => {
    if (list) {
      const Tag = list.ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag
          key={blocks.length}
          className={
            'space-y-1.5 pl-5 text-sm leading-7 ' +
            (list.ordered ? 'list-decimal' : 'list-disc marker:text-primary/60')
          }
        >
          {list.items.map((item, i) => (
            <li key={i + item}>
              <Inline text={item} />
            </li>
          ))}
        </Tag>,
      );
    }
    list = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)、]\s*(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      blocks.push(
        level === 1 ? (
          <h3 key={blocks.length} className='text-base font-semibold'>
            {heading[2]}
          </h3>
        ) : (
          <h4
            key={blocks.length}
            className='border-t pt-4 text-sm font-semibold text-foreground'
          >
            {heading[2]}
          </h4>
        ),
      );
    } else if (bullet || numbered) {
      flushParagraph();
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet || numbered)![1]);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return <div className='space-y-3'>{blocks}</div>;
}
