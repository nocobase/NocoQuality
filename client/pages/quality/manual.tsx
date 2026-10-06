import { useTranslation } from '@nocobase/i18n/client';
import { useState } from 'react';
import { History, UserRound, UserRoundCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  Detail,
  ManualState,
  ManualStatus,
  QualityUser,
} from './types.js';
import type { manualChecksFor } from './model.js';
import { ownerOf, time, userName } from './model.js';
import { SectionTitle, StatusBadge } from './ui.js';
import { useSubmission } from './use-submission.js';
import { useRequest } from './use-quality-data.js';
// Human-judged Checks are not run: a person keeps their state on each object, one Check or many at a time.

const STATUSES = ['unreviewed', 'reviewed', 'rereview'] as const;

type ManualEntry = ReturnType<typeof manualChecksFor>[number];

// The state, note and submit button shared by the single and the batch editor.
export function ManualStateForm({
  detail,
  items,
  initial = 'reviewed',
  onSaved,
}: {
  detail: Detail;
  items: { checkId: number; objectId: number }[];
  initial?: ManualStatus;
  onSaved: (count: number) => void;
}) {
  const { t } = useTranslation();
  const { submit, busy, error } = useSubmission();
  const [status, setStatus] = useState<ManualStatus>(initial);
  const [note, setNote] = useState('');
  const options = STATUSES.map((v) => ({
    value: v,
    label: t('qc.manual.status.' + v),
  }));
  return (
    <div className='space-y-3'>
      <div className='grid gap-3 sm:grid-cols-[12rem_1fr]'>
        <div className='space-y-2'>
          <Label>{t('qc.manual.statusLabel')}</Label>
          <Select
            value={status}
            items={options}
            onValueChange={(v) => {
              if (v) setStatus(v);
            }}
          >
            <SelectTrigger
              className='w-full bg-card'
              aria-label={t('qc.manual.statusLabel')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-2'>
          <Label>{t('qc.manual.note')}</Label>
          <Textarea
            aria-label={t('qc.manual.note')}
            value={note}
            maxLength={5000}
            rows={2}
            className='bg-card'
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      <div className='flex flex-wrap items-center gap-3'>
        <Button
          size='sm'
          disabled={busy || !items.length}
          onClick={() =>
            void submit(
              'quality/projects/' + detail.project.id + '/manual-states',
              { items, status, ...(note.trim() ? { note: note.trim() } : {}) },
              () => {
                setNote('');
                onSaved(items.length);
              },
            )
          }
        >
          {t(busy ? 'qc.saving' : 'qc.manual.update')}
        </Button>
        {error && <span className='text-sm text-destructive'>{error}</span>}
      </div>
    </div>
  );
}

function ManualHistory({
  detail,
  entry,
  users,
  revision,
}: {
  detail: Detail;
  entry: ManualEntry;
  users: QualityUser[];
  revision: number;
}) {
  const { t } = useTranslation();
  const rows = useRequest<ManualState[]>(
    'quality/projects/' +
      detail.project.id +
      '/manual-states?checkId=' +
      entry.check.id +
      '&objectId=' +
      entry.objectId,
    revision,
  ).data;
  if (!rows) return null;
  if (!rows.length)
    return (
      <p className='text-xs text-muted-foreground'>
        {t('qc.manual.noHistory')}
      </p>
    );
  return (
    <ol className='divide-y rounded-lg border'>
      {rows.map((row) => (
        <li key={row.id} className='space-y-1 px-3 py-2 text-sm'>
          <div className='flex flex-wrap items-center gap-2'>
            <StatusBadge kind='manual' value={row.status} />
            <span className='text-xs text-muted-foreground'>
              {t('qc.manual.changed', {
                name:
                  users.find((u) => u.id === row.createdBy)?.name ??
                  row.createdBy,
                at: time(row.createdAt),
              })}
            </span>
          </div>
          {row.note && (
            <p className='break-all text-muted-foreground'>{row.note}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

// One human-judged Check on one object: its state, the last change, a form to change it and the history.
function ManualRow({
  detail,
  entry,
  users,
  onChanged,
}: {
  detail: Detail;
  entry: ManualEntry;
  users: QualityUser[];
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [revision, setRevision] = useState(0);
  return (
    <li className='space-y-3 px-4 py-3'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-3'>
          <StatusBadge kind='manual' value={entry.status} />
          <span className='truncate font-medium'>{entry.check.name}</span>
        </div>
        <div className='flex gap-2'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setShowHistory((v) => !v)}
          >
            <History />
            {t(showHistory ? 'qc.manual.hideHistory' : 'qc.manual.history')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setEditing((v) => !v)}
          >
            {t(editing ? 'qc.cancel' : 'qc.manual.update')}
          </Button>
        </div>
      </div>
      {entry.state && (
        <p className='text-xs text-muted-foreground'>
          {t('qc.manual.changed', {
            name:
              users.find((u) => u.id === entry.state!.createdBy)?.name ??
              entry.state.createdBy,
            at: time(entry.state.createdAt),
          })}
          {entry.state.note ? ' · ' + entry.state.note : ''}
        </p>
      )}
      {editing && (
        <ManualStateForm
          key={entry.status}
          detail={detail}
          items={[{ checkId: entry.check.id, objectId: entry.objectId }]}
          initial={entry.status === 'reviewed' ? 'rereview' : 'reviewed'}
          onSaved={() => {
            setEditing(false);
            setRevision((v) => v + 1);
            onChanged?.();
          }}
        />
      )}
      {showHistory && (
        <ManualHistory
          detail={detail}
          entry={entry}
          users={users}
          revision={revision}
        />
      )}
    </li>
  );
}

// The human-judged Checks of one cell, in the cell's side panel.
export function ManualChecks({
  detail,
  entries,
  users,
  onChanged,
}: {
  detail: Detail;
  entries: ManualEntry[];
  users: QualityUser[];
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  if (!entries.length) return null;
  return (
    <section className='space-y-3'>
      <SectionTitle
        icon={<UserRoundCheck />}
        title={t('qc.manual.title') + ' · ' + entries.length}
        description={t('qc.manual.hint')}
      />
      <p className='flex items-center gap-1.5 text-sm text-muted-foreground'>
        <UserRound className='size-4' />
        {t('qc.manual.ownedBy', {
          name: userName(
            users,
            ownerOf(detail, entries[0]?.objectId),
            t('qc.noOwner'),
          ),
        })}
      </p>
      <ul className='divide-y rounded-xl border'>
        {entries.map((entry) => (
          <ManualRow
            key={entry.check.id}
            detail={detail}
            entry={entry}
            users={users}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </section>
  );
}
