import { useTranslation } from '@nocobase/i18n/client';
import { Fragment, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  GitPullRequest,
  History,
  Inbox,
  ListChecks,
  Plus,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cellScore, itemForResult, runProgress, skipReason } from './model.js';
import { RunDispatch, RunProgress, RunStatusBadge } from './run-status.js';
import type {
  Check,
  Detail,
  FixMode,
  QualityUser,
  Result,
  RunDetail,
  RunSummary,
  WorkItem,
  WorkItemDetail,
  WorkItemHistoryEntry,
} from './types.js';
import { ReportText, SectionTitle, StatusBadge } from './ui.js';
import { useSubmission } from './use-submission.js';
import { useRequest, useUsers } from './use-quality-data.js';

type Go = (view: string, extra?: Record<string, string>) => void;

export function ScoreChip({
  score,
  passed,
  total,
  complete,
  expected,
  pending = 0,
}: {
  score: number;
  passed: number;
  total: number;
  complete: boolean;
  expected: number;
  pending?: number;
}) {
  const { t } = useTranslation();
  // An unfinished cell has no score yet, but a failure or a waiting review already shows.
  if (!complete)
    return (
      <span className='text-xs'>
        <span className='text-muted-foreground'>
          {t('qc.runProgress', { done: total + pending, total: expected })}
        </span>
        {total > passed && (
          <span className='block font-medium'>
            {t('qc.runFailed')} {total - passed}
          </span>
        )}
        {pending > 0 && (
          <span className='block'>
            {t('qc.reviewPending')} {pending}
          </span>
        )}
      </span>
    );
  return (
    <span className='flex items-baseline gap-1.5'>
      <strong className='font-mono text-base tabular-nums'>
        {score.toFixed(1)}
      </strong>
      <span className='text-[11px] tabular-nums opacity-80'>
        {passed}/{total}
      </span>
    </span>
  );
}

function shortSha(commit?: string) {
  return commit ? commit.slice(0, 8) : '—';
}
function time(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

export function RunList({
  detail,
  go,
  revision,
}: {
  detail: Detail;
  go: Go;
  revision: number;
}) {
  const { t } = useTranslation();
  const runs = useRequest<RunSummary[]>(
    'quality/projects/' + detail.project.id + '/runs',
    revision,
  );
  if (!runs.data && !runs.failed) return <Skeleton className='h-48 w-full' />;
  if (!runs.data?.length)
    return (
      <Card className='qc-card'>
        <CardContent className='p-10 text-center'>
          <p className='font-medium'>{t('qc.noRuns2')}</p>
          <p className='mt-2 text-sm text-muted-foreground'>
            {t('qc.noRunsBody')}
          </p>
        </CardContent>
      </Card>
    );
  return (
    <Card className='qc-card overflow-hidden'>
      <CardContent className='p-0'>
        <Table>
          <TableHeader>
            <TableRow className='bg-muted/50 hover:bg-muted/50'>
              {[
                'runKey',
                'runStatusLabel',
                'runTime',
                'runProgressCol',
                'runRevision',
                'runPassed',
                'runFailed',
                'runOpenItems',
                'runPrs',
              ].map((k) => (
                <TableHead key={k} className='first:pl-5'>
                  {t('qc.' + k)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.data.map((run) => (
              <TableRow
                key={run.id}
                className='cursor-pointer'
                onClick={() => go('run', { record: String(run.id) })}
              >
                <TableCell className='pl-5'>
                  <Button
                    variant='link'
                    className='px-0 font-mono'
                    onClick={(e) => {
                      e.stopPropagation();
                      go('run', { record: String(run.id) });
                    }}
                  >
                    {run.key}
                  </Button>
                </TableCell>
                <TableCell>
                  <RunStatusBadge run={run} />
                </TableCell>
                <TableCell className='text-sm'>{time(run.startedAt)}</TableCell>
                <TableCell className='text-sm tabular-nums'>
                  {run.passed + run.failed} / {run.expected}
                  {run.pendingReview > 0 && (
                    <span className='ml-2 text-xs text-muted-foreground'>
                      {t('qc.reviewPending')} {run.pendingReview}
                    </span>
                  )}
                </TableCell>
                <TableCell className='font-mono text-xs'>
                  code {shortSha(run.environment?.code?.commit)}
                  <span className='mx-1 text-muted-foreground'>·</span>
                  pro {shortSha(run.environment?.codePro?.commit)}
                </TableCell>
                <TableCell>
                  <Badge variant='outline' className='qc-tone qc-tone-good'>
                    {run.passed}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant='outline'
                    className={
                      'qc-tone ' +
                      (run.failed ? 'qc-tone-bad' : 'qc-tone-muted')
                    }
                  >
                    {run.failed}
                  </Badge>
                </TableCell>
                <TableCell className='tabular-nums'>{run.openItems}</TableCell>
                <TableCell className='tabular-nums'>{run.prs}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function WorkItemState({
  item,
  users,
}: {
  item: WorkItem | undefined;
  users: QualityUser[];
}) {
  const { t } = useTranslation();
  if (!item) return null;
  return (
    <span className='flex flex-wrap items-center gap-2 text-xs'>
      <Badge
        variant='outline'
        className={
          'qc-tone ' +
          (item.status === 'open' ? 'qc-tone-warn' : 'qc-tone-muted')
        }
      >
        {t('qc.workKind.' + item.kind)} · {t('qc.workStatus.' + item.status)}
      </Badge>
      <span className='flex items-center gap-1 text-muted-foreground'>
        <UserRound className='size-3' />
        {users.find((u) => u.id === item.assigneeId)?.name ?? item.assigneeId}
      </span>
    </span>
  );
}

function ResultCard({
  detail,
  result,
  item,
  users,
  onChanged,
}: {
  detail: Detail;
  result: Result;
  item?: WorkItem;
  users: QualityUser[];
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const failed = result.conclusion === 'failed';
  const pending = result.reviewStatus === 'pending';
  const reason =
    !item && failed && !pending ? skipReason(detail, result) : null;
  const [open, setOpen] = useState(failed);
  const check = detail.checks.find((c) => c.id === result.checkId);
  const version = detail.standards.find((s) => s.id === result.standardId);
  return (
    <section
      className={
        'overflow-hidden rounded-xl border ' +
        (failed ? 'border-(--qc-bad)/30' : '')
      }
    >
      <div className='flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-3'>
        <div className='flex min-w-0 items-center gap-3'>
          {pending ? (
            <Badge variant='outline' className='qc-tone qc-tone-warn'>
              {t('qc.reviewPending')}
            </Badge>
          ) : (
            <StatusBadge kind='result' value={result.conclusion} />
          )}
          <h3 className='truncate text-base font-semibold'>
            {check?.name ?? '#' + result.checkId}
          </h3>
        </div>
        <div className='flex flex-wrap items-center gap-3 text-xs text-muted-foreground'>
          <span>
            {t('qc.standardVersion')} v{version?.version ?? '?'}
          </span>
          {result.prUrl && (
            <a
              href={result.prUrl}
              target='_blank'
              rel='noreferrer'
              className='inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline'
            >
              <GitPullRequest className='size-4' />
              {t('qc.viewPr')}
              <ExternalLink className='size-3' />
            </a>
          )}
          <WorkItemState item={item} users={users} />
          {reason && <span>{t('qc.skip.' + reason)}</span>}
        </div>
      </div>
      <div className='space-y-4 p-5'>
        {pending && (
          <ReviewForm detail={detail} result={result} onChanged={onChanged} />
        )}
        {result.reviewStatus === 'confirmed' && (
          <p className='text-xs text-muted-foreground'>
            {t('qc.reviewedBy', {
              name:
                users.find((u) => u.id === result.reviewedBy)?.name ??
                result.reviewedBy,
              at: time(result.reviewedAt),
            })}
            {result.reviewNote ? ' · ' + result.reviewNote : ''}
          </p>
        )}
        {result.note && (
          <p
            className={
              'rounded-lg px-4 py-3 text-sm leading-7 ' +
              (failed ? 'qc-tone qc-tone-bad border' : 'bg-muted/40')
            }
          >
            {result.note}
          </p>
        )}
        {result.evidence && (
          <div>
            <Button
              variant='ghost'
              size='sm'
              className='-ml-2'
              onClick={() => setOpen((v) => !v)}
            >
              {t(open ? 'qc.hideEvidence' : 'qc.showEvidence')}
            </Button>
            {open && (
              <div className='mt-2 rounded-lg border bg-background p-5 text-muted-foreground'>
                <ReportText text={result.evidence} />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// A person confirms a result whose standard requires review; only then does it count toward the score.
function ReviewForm({
  detail,
  result,
  onChanged,
}: {
  detail: Detail;
  result: Result;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const { submit, busy, error } = useSubmission();
  const [note, setNote] = useState('');
  const send = (conclusion: 'passed' | 'failed') =>
    void submit(
      'quality/projects/' +
        detail.project.id +
        '/runs/' +
        result.runId +
        '/results/' +
        result.id +
        '/review',
      { conclusion, ...(note.trim() ? { note: note.trim() } : {}) },
      () => onChanged?.(),
    );
  return (
    <div className='qc-tone qc-tone-warn space-y-3 rounded-lg border p-4'>
      <p className='text-sm'>
        {t('qc.reviewHint', {
          conclusion: t(
            'qc.resultStatus.' +
              (result.reportedConclusion ?? result.conclusion),
          ),
        })}
      </p>
      <Textarea
        aria-label={t('qc.reviewNoteLabel')}
        placeholder={t('qc.reviewNoteLabel')}
        value={note}
        maxLength={5000}
        rows={2}
        className='bg-background text-foreground'
        onChange={(e) => setNote(e.target.value)}
      />
      <div className='flex flex-wrap gap-2'>
        <Button size='sm' disabled={busy} onClick={() => send('passed')}>
          {t('qc.confirmPassed')}
        </Button>
        <Button
          size='sm'
          variant='destructive'
          disabled={busy}
          onClick={() => send('failed')}
        >
          {t('qc.confirmFailed')}
        </Button>
      </div>
      {error && <p className='text-sm text-destructive'>{error}</p>}
    </div>
  );
}

// One cell's results in a wide side panel, reachable from the run page and from the overall matrix.
export function CellResultsSheet({
  detail,
  data,
  cell,
  onClose,
  onOpenRun,
  onChanged,
}: {
  detail: Detail;
  data: RunDetail | undefined;
  cell: { o: number; d: number } | null;
  onClose: () => void;
  onOpenRun?: () => void;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const users = useUsers();
  const scored =
    cell && data ? cellScore(detail, data.results, cell.o, cell.d) : null;
  const rows = [...(scored?.rows ?? [])].sort((a, b) =>
    a.conclusion === b.conclusion ? 0 : a.conclusion === 'failed' ? -1 : 1,
  );
  return (
    <Sheet
      open={!!cell && !!data}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className='qc-shell w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-4xl'>
        <SheetHeader className='border-b px-6 pt-6 pb-5'>
          <div className='flex flex-wrap items-end justify-between gap-4 pr-8'>
            <div className='min-w-0'>
              <SheetTitle className='text-xl'>
                {detail.objects.find((o) => o.id === cell?.o)?.name}
                <span className='mx-2 text-muted-foreground'>·</span>
                {detail.dimensions.find((d) => d.id === cell?.d)?.name}
              </SheetTitle>
              <SheetDescription className='mt-1'>
                {t('qc.runKey')}{' '}
                <span className='font-mono'>{data?.run.key}</span> ·{' '}
                {t('qc.scoreRule')}
              </SheetDescription>
            </div>
            {scored && (
              <div
                className={
                  'qc-tone rounded-xl border px-4 py-2 ' +
                  (!scored.complete
                    ? 'qc-tone-muted'
                    : scored.passed === scored.total
                      ? 'qc-tone-good'
                      : 'qc-tone-bad')
                }
              >
                <ScoreChip {...scored} />
              </div>
            )}
          </div>
          {onOpenRun && (
            <Button
              variant='outline'
              size='sm'
              className='mt-3 w-fit'
              onClick={onOpenRun}
            >
              <History />
              {t('qc.openInRun')}
            </Button>
          )}
        </SheetHeader>
        <div className='space-y-4 px-6 pb-8'>
          {rows.map((r) => (
            <ResultCard
              key={r.id}
              detail={detail}
              result={r}
              item={data ? itemForResult(data.workItems, r) : undefined}
              users={users}
              onChanged={onChanged}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function RunView({
  detail,
  runId,
  go,
  revision,
  initialCell,
  initialOnlyFailed = false,
  onChanged,
}: {
  detail: Detail;
  runId: string;
  go: Go;
  revision: number;
  initialCell: { o: number; d: number } | null;
  initialOnlyFailed?: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const state = useRequest<RunDetail>(
    'quality/projects/' + detail.project.id + '/runs/' + runId,
    revision,
  );
  const [onlyFailed, setOnlyFailed] = useState(initialOnlyFailed);
  const [cell, setCell] = useState<{ o: number; d: number } | null>(
    initialCell,
  );
  if (!state.data)
    return state.failed ? (
      <Button onClick={() => go('runs')}>{t('qc.runs')}</Button>
    ) : (
      <Skeleton className='h-72 w-full' />
    );
  const { run, results, workItems } = state.data;
  // A started run shows every planned pair, reported or not; an imported run shows what it brought.
  const pairs = run.plan ?? results;
  const objectIds = new Set(pairs.map((r) => r.objectId));
  const checkDims = new Set(
    detail.checks
      .filter((c) => pairs.some((r) => r.checkId === c.id))
      .map((c) => c.dimensionId),
  );
  const skipped = results.filter(
    (r) =>
      r.conclusion === 'failed' &&
      r.reviewStatus !== 'pending' &&
      !itemForResult(workItems, r),
  ).length;
  const { done, total } = runProgress(run, results);
  const dimensions = detail.dimensions.filter((d) => checkDims.has(d.id));
  const objects = detail.objects.filter(
    (o) =>
      objectIds.has(o.id) &&
      (!onlyFailed ||
        results.some((r) => r.objectId === o.id && r.conclusion === 'failed')),
  );
  const groups = Array.from(new Set(objects.map((o) => o.category)));
  const passed = results.filter(
    (r) => r.conclusion === 'passed' && r.reviewStatus !== 'pending',
  ).length;
  const pendingReview = results.filter(
    (r) => r.reviewStatus === 'pending',
  ).length;
  const env = run.environment;
  return (
    <div className='space-y-5'>
      <Button variant='outline' onClick={() => go('runs')}>
        <ArrowLeft />
        {t('qc.runs')}
      </Button>
      <Card className='qc-card overflow-hidden'>
        <CardContent className='p-0'>
          <div className='qc-hero relative overflow-hidden border-b p-6'>
            <div className='relative z-10 flex flex-wrap items-end justify-between gap-4'>
              <div className='min-w-0 space-y-3'>
                <RunStatusBadge run={run} />
                <h2 className='font-mono text-2xl font-semibold'>{run.key}</h2>
                <p className='text-sm text-muted-foreground'>
                  {time(run.startedAt)} → {time(run.finishedAt)}
                  {run.executor ? ' · ' + run.executor : ''}
                </p>
                {run.plan && (
                  <div className='max-w-md'>
                    <RunProgress run={run} results={results} />
                  </div>
                )}
                <RunDispatch detail={detail} run={run} onChanged={onChanged} />
              </div>
              <div className='flex flex-wrap gap-2'>
                <Badge variant='outline' className='qc-tone qc-tone-good'>
                  {t('qc.runPassed')} {passed}
                </Badge>
                <Badge variant='outline' className='qc-tone qc-tone-bad'>
                  {t('qc.runFailed')} {results.length - passed - pendingReview}
                </Badge>
                {pendingReview > 0 && (
                  <Badge variant='outline' className='qc-tone qc-tone-warn'>
                    {t('qc.reviewPending')} {pendingReview}
                  </Badge>
                )}
                {total > done && (
                  <Badge variant='outline' className='qc-tone qc-tone-muted'>
                    {t('qc.notRun')} {total - done}
                  </Badge>
                )}
                <Badge variant='outline' className='qc-tone qc-tone-warn'>
                  {t('qc.runOpenItems')}{' '}
                  {workItems.filter((i) => i.status === 'open').length}
                </Badge>
              </div>
            </div>
          </div>
          <dl className='grid divide-y text-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0'>
            {(
              [
                ['code', env?.code],
                ['code-pro', env?.codePro],
              ] as const
            ).map(([name, repo]) => (
              <div key={name} className='min-w-0 p-5'>
                <dt className='text-xs text-muted-foreground'>
                  {name} · {repo?.repo}
                </dt>
                <dd className='mt-2 font-mono text-xs break-all'>
                  {repo?.commit ?? '—'}
                </dd>
                <dd className='mt-1 text-xs text-muted-foreground'>
                  {repo &&
                    t(
                      repo.pulledThisRun
                        ? 'qc.pulledThisRun'
                        : 'qc.notPulledThisRun',
                      { at: time(repo.lastSyncedAt) },
                    )}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card className='qc-card overflow-hidden'>
        <CardContent className='space-y-4 p-5'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <SectionTitle
              icon={<ListChecks />}
              title={t('qc.runResults')}
              description={t('qc.scoreRule')}
            />
            <label className='flex items-center gap-2 text-sm'>
              <Switch checked={onlyFailed} onCheckedChange={setOnlyFailed} />
              {t('qc.onlyFailed')}
            </label>
          </div>
          {skipped > 0 && (
            <p className='text-xs text-muted-foreground'>
              {t('qc.skippedCount', { count: skipped })}
            </p>
          )}
          <div className='overflow-x-auto rounded-xl border'>
            <Table className='qc-matrix'>
              <TableHeader>
                <TableRow className='bg-muted/50 hover:bg-muted/50'>
                  <TableHead className='min-w-44 bg-muted/50!'>
                    {t('qc.object')}
                  </TableHead>
                  {dimensions.map((d) => (
                    <TableHead key={d.id} className='min-w-36'>
                      {d.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <Fragment key={group}>
                    <TableRow className='hover:bg-transparent'>
                      <TableCell
                        colSpan={dimensions.length + 1}
                        className='bg-muted/30! py-2 text-sm font-semibold'
                      >
                        {t('qc.category.' + group)}
                      </TableCell>
                    </TableRow>
                    {objects
                      .filter((o) => o.category === group)
                      .map((o) => (
                        <TableRow
                          key={o.id}
                          className={o.testingPaused ? 'opacity-55' : ''}
                        >
                          <TableCell className='min-w-44 font-medium'>
                            {o.name}
                            {o.testingPaused && (
                              <span className='ml-2 text-xs font-normal text-muted-foreground'>
                                {t('qc.paused')}
                              </span>
                            )}
                          </TableCell>
                          {dimensions.map((d) => {
                            const s = cellScore(detail, results, o.id, d.id);
                            return (
                              <TableCell key={d.id} className='p-1.5'>
                                {s ? (
                                  <button
                                    type='button'
                                    className={
                                      'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring qc-tone ' +
                                      (s.total > s.passed
                                        ? 'qc-tone-bad'
                                        : s.pending
                                          ? 'qc-tone-warn'
                                          : !s.complete
                                            ? 'qc-tone-muted'
                                            : 'qc-tone-good')
                                    }
                                    onClick={() =>
                                      setCell({ o: o.id, d: d.id })
                                    }
                                  >
                                    <ScoreChip {...s} />
                                  </button>
                                ) : pairs.some(
                                    (p) =>
                                      p.objectId === o.id &&
                                      detail.checks.find(
                                        (c) => c.id === p.checkId,
                                      )?.dimensionId === d.id,
                                  ) ? (
                                  <span className='block px-3 text-xs text-muted-foreground'>
                                    {t('qc.notRun')}
                                  </span>
                                ) : (
                                  <span className='block text-center text-xs text-muted-foreground/60'>
                                    —
                                  </span>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      {!!run.steps?.length && (
        <Card className='qc-card'>
          <CardContent className='space-y-3 p-6'>
            <SectionTitle icon={<ListChecks />} title={t('qc.runSteps')} />
            <ol className='space-y-2 text-sm'>
              {run.steps.map((step, i) => (
                <li key={step.at + step.action} className='flex gap-3'>
                  <span className='w-6 shrink-0 font-mono text-xs text-muted-foreground'>
                    {i + 1}
                  </span>
                  <span className='min-w-0'>
                    <span className='font-mono text-xs'>{step.action}</span>
                    {step.status === 'failed' && (
                      <Badge
                        variant='outline'
                        className='qc-tone qc-tone-bad ml-2'
                      >
                        {t('qc.stepFailed')}
                      </Badge>
                    )}
                    <span className='block text-muted-foreground'>
                      {[step.note, step.error, step.decision]
                        .filter(Boolean)
                        .join('；')}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
      <CellResultsSheet
        detail={detail}
        data={state.data}
        cell={cell}
        onClose={() => setCell(null)}
        onChanged={onChanged}
      />
    </div>
  );
}

const PR_TONE: Record<string, string> = {
  open: 'qc-tone-warn',
  merged: 'qc-tone-good',
  closed: 'qc-tone-muted',
};

function PrLink({ item }: { item: WorkItem }) {
  const { t } = useTranslation();
  if (!item.prUrl) return null;
  return (
    <span className='inline-flex items-center gap-2'>
      <a
        href={item.prUrl}
        target='_blank'
        rel='noreferrer'
        className='inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline'
        onClick={(e) => e.stopPropagation()}
      >
        <GitPullRequest className='size-4' />
        {item.prUrl.replace(/^https:\/\/github\.com\//, '')}
        <ExternalLink className='size-3' />
      </a>
      {item.prState && (
        <Badge variant='outline' className={'qc-tone ' + PR_TONE[item.prState]}>
          {t('qc.prState.' + item.prState)}
        </Badge>
      )}
    </span>
  );
}

function ContextSection({
  title,
  text,
}: {
  title: string;
  text?: string | null;
}) {
  if (!text) return null;
  return (
    <section className='space-y-2'>
      <h3 className='text-sm font-semibold'>{title}</h3>
      <div className='rounded-lg border bg-background p-4 text-muted-foreground'>
        <ReportText text={text} />
      </div>
    </section>
  );
}

// How many runs a run to-do has failed in; shown only once a later run has continued it.
function Occurrences({
  item,
  className = '',
}: {
  item: WorkItem;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!item.occurrences || item.occurrences < 2) return null;
  return (
    <Badge variant='outline' className={'qc-tone qc-tone-bad ' + className}>
      {t('qc.occurrences', { count: item.occurrences })}
    </Badge>
  );
}

// Every result of the to-do's Check × object, newest first, so a changed suggestion in a later run is not lost.
function WorkItemHistory({ history }: { history: WorkItemHistoryEntry[] }) {
  const { t } = useTranslation();
  if (history.length < 2) return null;
  return (
    <section className='space-y-2'>
      <h3 className='text-sm font-semibold'>{t('qc.runHistory')}</h3>
      <ol className='divide-y rounded-lg border'>
        {history.map((h) => (
          <li key={h.id} className='space-y-1 px-4 py-3 text-sm'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='font-mono text-xs'>{h.runKey}</span>
              {h.reviewStatus === 'pending' ? (
                <Badge variant='outline' className='qc-tone qc-tone-warn'>
                  {t('qc.reviewPending')}
                </Badge>
              ) : (
                <StatusBadge kind='result' value={h.conclusion} />
              )}
              {h.prUrl && (
                <a
                  href={h.prUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline'
                >
                  <GitPullRequest className='size-3.5' />
                  {h.prUrl.replace(/^https:\/\/github\.com\//, '')}
                </a>
              )}
            </div>
            {h.note && <p className='text-muted-foreground'>{h.note}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

// One to-do with the context needed to take it over, whether it came from a run or was filed by hand.
function WorkItemSheet({
  detail,
  itemId,
  users,
  revision,
  onClose,
  onDone,
}: {
  detail: Detail;
  itemId: number | null;
  users: QualityUser[];
  revision: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { submit, busy, error } = useSubmission();
  const state = useRequest<WorkItemDetail>(
    itemId
      ? 'quality/projects/' + detail.project.id + '/work-items/' + itemId
      : '',
    revision,
  );
  const data = state.data;
  const item = data?.item;
  const check = detail.checks.find((c) => c.id === item?.checkId);
  const object = detail.objects.find((o) => o.id === item?.objectId);
  const dimension = detail.dimensions.find((d) => d.id === check?.dimensionId);
  const standard = detail.standards.find(
    (s) => s.id === data?.result?.standardId,
  );
  const env = data?.run?.environment;
  // Run to-dos derive their context from the Check standard, the run environment and the result evidence.
  const context =
    item?.source === 'run'
      ? {
          problem: [check?.name, data?.result?.note].filter(Boolean).join('：'),
          scenario: [
            t('qc.runKey') + ' ' + (data?.run?.key ?? ''),
            t('qc.object') +
              '：' +
              (object?.name ?? '') +
              (dimension ? ' · ' + dimension.name : ''),
            t('qc.standardVersion') + ' v' + (standard?.version ?? '?'),
            env?.code ? 'code ' + env.code.commit : '',
            env?.codePro ? 'code-pro ' + env.codePro.commit : '',
          ]
            .filter(Boolean)
            .map((line) => '- ' + line)
            .join('\n'),
          actualExpected: standard?.passCriteria ?? null,
          evidence: data?.result?.evidence ?? null,
          impact: null,
          handling: t(
            check?.fixMode === 'pr' ? 'qc.handlingPr' : 'qc.handlingAssign',
          ),
        }
      : item;
  return (
    <Sheet
      open={!!itemId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className='qc-shell w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-4xl'>
        <SheetHeader className='border-b px-6 pt-6 pb-5'>
          <div className='flex flex-wrap items-center gap-2 pr-8'>
            {item && (
              <>
                <Badge variant='outline'>
                  {t('qc.workSource.' + item.source)}
                </Badge>
                <Badge variant='outline'>{t('qc.workKind.' + item.kind)}</Badge>
                <Badge
                  variant='outline'
                  className={
                    'qc-tone ' +
                    (item.status === 'open' ? 'qc-tone-warn' : 'qc-tone-muted')
                  }
                >
                  {t('qc.workStatus.' + item.status)}
                </Badge>
                <Occurrences item={item} />
              </>
            )}
          </div>
          <SheetTitle className='mt-2 text-xl'>{item?.title}</SheetTitle>
          <SheetDescription>
            {item &&
              t('qc.workMeta', {
                assignee:
                  users.find((u) => u.id === item.assigneeId)?.name ??
                  item.assigneeId,
                at: time(item.createdAt),
              })}
          </SheetDescription>
          {item && (
            <div className='mt-3 flex flex-wrap items-center gap-3'>
              <PrLink item={item} />
              {item.status === 'open' && (
                <Button
                  size='sm'
                  disabled={busy}
                  onClick={() =>
                    void submit(
                      'quality/projects/' +
                        detail.project.id +
                        '/work-items/complete',
                      { ids: [item.id] },
                      onDone,
                    )
                  }
                >
                  {t('qc.markDone')}
                </Button>
              )}
              {error && (
                <span className='text-sm text-destructive'>{error}</span>
              )}
            </div>
          )}
        </SheetHeader>
        {!data ? (
          <Skeleton className='mx-6 h-48' />
        ) : (
          <div className='space-y-5 px-6 pb-8'>
            <ContextSection
              title={t('qc.ctx.problem')}
              text={context?.problem}
            />
            <ContextSection
              title={t('qc.ctx.scenario')}
              text={context?.scenario}
            />
            <ContextSection
              title={t(
                item?.source === 'run'
                  ? 'qc.ctx.criteria'
                  : 'qc.ctx.actualExpected',
              )}
              text={context?.actualExpected}
            />
            <ContextSection
              title={t('qc.ctx.evidence')}
              text={context?.evidence}
            />
            <ContextSection title={t('qc.ctx.impact')} text={context?.impact} />
            <ContextSection
              title={t('qc.ctx.handling')}
              text={context?.handling}
            />
            <WorkItemHistory history={data.history ?? []} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Everyone's to-dos (the task list) or only mine; both open each to-do in place with its full context.
export function WorkItemsView({
  detail,
  go,
  revision,
  onChanged,
  defaultScope,
}: {
  detail: Detail;
  go: Go;
  revision: number;
  onChanged: () => void;
  defaultScope: 'mine' | 'all';
}) {
  const { t } = useTranslation();
  const users = useUsers();
  const [scope, setScope] = useState<'mine' | 'all'>(defaultScope);
  const [status, setStatus] = useState<'open' | 'done'>('open');
  const [assignee, setAssignee] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const { submit, busy, error } = useSubmission();
  const state = useRequest<WorkItem[]>(
    'quality/projects/' + detail.project.id + '/work-items?scope=' + scope,
    revision,
  );
  const all = Array.isArray(state.data) ? state.data : [];
  const rows = all.filter(
    (i) => i.status === status && (!assignee || i.assigneeId === assignee),
  );
  const allPicked = rows.length > 0 && rows.every((r) => picked.includes(r.id));
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  const perAssignee = Array.from(
    all
      .filter((i) => i.status === 'open')
      .reduce(
        (m, i) => m.set(i.assigneeId, (m.get(i.assigneeId) ?? 0) + 1),
        new Map<string, number>(),
      ),
  );
  const done = () => {
    setPicked([]);
    onChanged();
    window.dispatchEvent(new Event('quality-todo-changed'));
  };
  return (
    <div className='space-y-4'>
      {scope === 'all' && perAssignee.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {perAssignee.map(([id, count]) => (
            <button
              type='button'
              key={id}
              className={
                'qc-lift flex items-center gap-2 rounded-xl border px-4 py-2 text-sm ' +
                (assignee === id ? 'border-primary/50 bg-primary/5' : 'bg-card')
              }
              onClick={() => setAssignee(assignee === id ? '' : id)}
            >
              <UserRound className='size-4 text-muted-foreground' />
              {nameOf(id)}
              <strong className='tabular-nums'>{count}</strong>
            </button>
          ))}
        </div>
      )}
      <div className='flex flex-wrap items-center gap-3'>
        <Tabs
          value={scope}
          onValueChange={(v) => {
            setScope(v as 'mine' | 'all');
            setPicked([]);
            setAssignee('');
          }}
        >
          <TabsList>
            <TabsTrigger value='mine'>{t('qc.todoMine')}</TabsTrigger>
            <TabsTrigger value='all'>{t('qc.todoAll')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs
          value={status}
          onValueChange={(v) => {
            setStatus(v as 'open' | 'done');
            setPicked([]);
          }}
        >
          <TabsList>
            <TabsTrigger value='open'>{t('qc.workStatus.open')}</TabsTrigger>
            <TabsTrigger value='done'>{t('qc.workStatus.done')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className='ml-auto flex flex-wrap gap-2'>
          <Button variant='outline' onClick={() => go('new-work-item')}>
            <Plus />
            {t('qc.newWorkItem')}
          </Button>
          {status === 'open' && (
            <Button
              disabled={!picked.length || busy}
              onClick={() =>
                void submit(
                  'quality/projects/' +
                    detail.project.id +
                    '/work-items/complete',
                  { ids: picked },
                  done,
                )
              }
            >
              {t('qc.completeSelected', { count: picked.length })}
            </Button>
          )}
        </div>
      </div>
      {error && <p className='text-sm text-destructive'>{error}</p>}
      <Card className='qc-card overflow-hidden'>
        <CardContent className='p-0'>
          {!state.data && !state.failed ? (
            <Skeleton className='m-5 h-32' />
          ) : rows.length ? (
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/50 hover:bg-muted/50'>
                  {status === 'open' && (
                    <TableHead className='w-10 pl-5'>
                      <Checkbox
                        aria-label={t('qc.selectAll')}
                        checked={allPicked}
                        onCheckedChange={(v) =>
                          setPicked(v ? rows.map((r) => r.id) : [])
                        }
                      />
                    </TableHead>
                  )}
                  {[
                    'workTitle',
                    'workSourceLabel',
                    'workKindLabel',
                    'assignee',
                    'createdAt',
                  ].map((k) => (
                    <TableHead key={k} className='first:pl-5'>
                      {t('qc.' + k)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow
                    key={item.id}
                    className='cursor-pointer'
                    onClick={() => setOpenId(item.id)}
                  >
                    {status === 'open' && (
                      <TableCell
                        className='pl-5'
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          aria-label={item.title}
                          checked={picked.includes(item.id)}
                          onCheckedChange={(v) =>
                            setPicked((p) =>
                              v
                                ? [...p, item.id]
                                : p.filter((x) => x !== item.id),
                            )
                          }
                        />
                      </TableCell>
                    )}
                    <TableCell className='max-w-md whitespace-normal first:pl-5'>
                      <span className='font-medium'>{item.title}</span>
                      <Occurrences item={item} className='ml-2' />
                      {item.prUrl && (
                        <span className='mt-1 block'>
                          <PrLink item={item} />
                        </span>
                      )}
                    </TableCell>
                    <TableCell className='text-sm'>
                      {item.source === 'run' ? (
                        <span className='font-mono text-xs'>{item.runKey}</span>
                      ) : (
                        t('qc.workSource.manual')
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>
                        {t('qc.workKind.' + item.kind)}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-sm'>
                      {nameOf(item.assigneeId)}
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {time(item.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className='p-10 text-center'>
              <Inbox className='mx-auto size-8 text-muted-foreground' />
              <p className='mt-3 font-medium'>{t('qc.noTodo')}</p>
            </div>
          )}
        </CardContent>
      </Card>
      <WorkItemSheet
        detail={detail}
        itemId={openId}
        users={users}
        revision={revision}
        onClose={() => setOpenId(null)}
        onDone={() => {
          setOpenId(null);
          done();
        }}
      />
    </div>
  );
}

// How a not-passed result of this Check is handled, and who reviews or handles it.
export function CheckSettings({
  detail,
  check,
  onChanged,
}: {
  detail: Detail;
  check: Check;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const users = useUsers();
  const { submit, busy, error } = useSubmission();
  const [fixMode, setFixMode] = useState<FixMode>(check.fixMode);
  const [assignee, setAssignee] = useState(check.assigneeId ?? '');
  const changed =
    fixMode !== check.fixMode || assignee !== (check.assigneeId ?? '');
  const modes = (['pr', 'assign'] as const).map((v) => ({
    value: v,
    label: t('qc.fixMode.' + v),
  }));
  const people = [
    { value: '', label: t('qc.assigneeDefault') },
    ...users.map((u) => ({ value: u.id, label: u.name })),
  ];
  return (
    <Card className='qc-card'>
      <CardContent className='space-y-4 p-5'>
        <SectionTitle
          icon={<GitPullRequest />}
          title={t('qc.fixSettings')}
          description={t('qc.fixSettingsHint')}
        />
        <div className='space-y-2'>
          <Label>{t('qc.fixModeLabel')}</Label>
          <Select
            value={fixMode}
            items={modes}
            onValueChange={(v) => {
              if (v) setFixMode(v);
            }}
          >
            <SelectTrigger
              className='w-full bg-card'
              aria-label={t('qc.fixModeLabel')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modes.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-2'>
          <Label>{t(fixMode === 'pr' ? 'qc.reviewer' : 'qc.handler')}</Label>
          <Select
            value={assignee}
            items={people}
            onValueChange={(v) => setAssignee(v ?? '')}
          >
            <SelectTrigger
              className='w-full bg-card'
              aria-label={t('qc.assignee')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.value || 'default'} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error && <p className='text-sm text-destructive'>{error}</p>}
        <Button
          className='w-full'
          disabled={!changed || busy}
          onClick={() =>
            void submit(
              'quality/projects/' +
                detail.project.id +
                '/checks/' +
                check.id +
                '/settings',
              { fixMode, assigneeId: assignee || null },
              onChanged,
            )
          }
        >
          {t(busy ? 'qc.saving' : 'qc.save')}
        </Button>
      </CardContent>
    </Card>
  );
}
