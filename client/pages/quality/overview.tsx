import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  GitPullRequest,
  History,
  ListChecks,
  UserRoundCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  Detail,
  Result,
  RunDetail,
  RunSummary,
  WorkItem,
} from './types.js';
import { useRequest } from './use-quality-data.js';
import {
  isManual,
  itemForResult,
  manualPairs,
  runProgress,
  skipReason,
  time,
} from './model.js';
import { SectionTitle } from './ui.js';
import {
  RunDispatch,
  RunProgress,
  RunStatusBadge,
  StartRunButton,
} from './run-status.js';

type Go = (view: string, extra?: Record<string, string>) => void;

const pairKey = (r: Pick<Result, 'checkId' | 'objectId'>) =>
  r.checkId + ':' + r.objectId;

// What changed between two runs, by Check × object.
function compareRuns(current: readonly Result[], previous: readonly Result[]) {
  const before = new Map(previous.map((r) => [pairKey(r), r.conclusion]));
  const now = current;
  return {
    newlyFailed: now.filter(
      (r) => r.conclusion === 'failed' && before.get(pairKey(r)) !== 'failed',
    ),
    recovered: now.filter(
      (r) => r.conclusion === 'passed' && before.get(pairKey(r)) === 'failed',
    ),
    stillFailed: now.filter(
      (r) => r.conclusion === 'failed' && before.get(pairKey(r)) === 'failed',
    ),
  };
}

// The current run first: what failed, which human-judged Checks wait for a person, and what changed since the
// previous run.
export function Overview({
  detail,
  go,
  revision,
  onChanged,
  onNotice,
}: {
  detail: Detail;
  go: Go;
  revision: number;
  onChanged: () => void;
  onNotice: (message: string) => void;
}) {
  const { t } = useTranslation();
  const base = 'quality/projects/' + detail.project.id;
  const runs = useRequest<RunSummary[]>(base + '/runs', revision);
  const list = Array.isArray(runs.data) ? runs.data : [];
  const latest = useRequest<RunDetail>(
    list[0] ? base + '/runs/' + list[0].id : '',
    revision,
  ).data;
  const previous = useRequest<RunDetail>(
    list[1] ? base + '/runs/' + list[1].id : '',
    revision,
  ).data;
  const items = useRequest<WorkItem[]>(
    base + '/work-items?scope=all',
    revision,
  ).data;
  const mine = useRequest<WorkItem[]>(base + '/work-items', revision).data;
  const running = list.some((r) => r.displayStatus === 'running');
  const started = (run: { key: string; externalTaskId?: string | null }) => {
    onNotice(
      t(run.externalTaskId ? 'qc.runStarted' : 'qc.runStartedManual', {
        key: run.key,
      }),
    );
    onChanged();
  };
  const start = (
    <StartRunButton detail={detail} running={running} onStarted={started} />
  );
  if (!runs.data && !runs.failed) return <Skeleton className='h-72 w-full' />;
  if (!list.length)
    return (
      <Card className='qc-card'>
        <CardContent className='flex flex-col items-center gap-4 p-12 text-center'>
          <History className='size-8 text-muted-foreground' />
          <div>
            <p className='text-lg font-semibold'>{t('qc.now.noRunTitle')}</p>
            <p className='mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground'>
              {t('qc.now.noRunBody')}
            </p>
          </div>
          {start}
        </CardContent>
      </Card>
    );
  if (!latest) return <Skeleton className='h-72 w-full' />;
  const { run, workItems } = latest;
  // Results an older run reported for a Check that is human-judged now no longer count.
  const results = latest.results.filter((r) => !isManual(detail, r.checkId));
  const failed = results.filter((r) => r.conclusion === 'failed');
  const manualPending = manualPairs(detail).filter(
    (m) => m.status !== 'reviewed',
  );
  const openPrs = (items ?? []).filter(
    (i) => i.status === 'open' && i.kind === 'pr_review',
  );
  const myOpen = (mine ?? []).filter((i) => i.status === 'open');
  const { done, total } = runProgress(run, latest.results);
  const notRun = total - done;
  const name = (r: Result) =>
    (detail.checks.find((c) => c.id === r.checkId)?.name ?? '#' + r.checkId) +
    ' · ' +
    (detail.objects.find((o) => o.id === r.objectId)?.name ?? '#' + r.objectId);
  const openCell = (r: Result) =>
    go('run', {
      record: String(run.id),
      object: String(r.objectId),
      dimension: String(
        detail.checks.find((c) => c.id === r.checkId)?.dimensionId ?? '',
      ),
    });
  const tiles = [
    {
      key: 'failed',
      value: failed.length,
      tone: failed.length ? 'bad' : 'good',
      Icon: CircleX,
      onClick: () => go('run', { record: String(run.id), failed: '1' }),
    },
    {
      key: 'manualPending',
      value: manualPending.length,
      tone: manualPending.length ? 'warn' : 'muted',
      Icon: UserRoundCheck,
      onClick: () => go('coverage'),
    },
    {
      key: 'openPrs',
      value: openPrs.length,
      tone: openPrs.length ? 'warn' : 'muted',
      Icon: GitPullRequest,
      onClick: () => go('todo', { scope: 'all' }),
    },
    {
      key: 'myTodo',
      value: myOpen.length,
      tone: myOpen.length ? 'primary' : 'muted',
      Icon: ListChecks,
      onClick: () => go('todo'),
    },
  ] as const;
  const diff = previous
    ? compareRuns(
        results,
        previous.results.filter((r) => !isManual(detail, r.checkId)),
      )
    : null;
  return (
    <>
      <Card className='qc-card overflow-hidden'>
        <CardContent className='grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-start'>
          <div className='min-w-0 space-y-4'>
            <div className='flex flex-wrap items-center gap-3'>
              <RunStatusBadge run={run} />
              <h2 className='font-mono text-2xl font-semibold'>{run.key}</h2>
              <span className='text-sm text-muted-foreground'>
                {time(run.startedAt)}
                {run.finishedAt ? ' → ' + time(run.finishedAt) : ''}
              </span>
            </div>
            <RunProgress run={run} results={latest.results} />
            <RunDispatch detail={detail} run={run} onChanged={onChanged} />
          </div>
          <div className='flex flex-wrap items-start gap-2 lg:flex-col lg:items-end'>
            {start}
            <Button
              variant='ghost'
              size='sm'
              onClick={() => go('run', { record: String(run.id) })}
            >
              {t('qc.openRun')}
              <ArrowRight />
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className='grid grid-cols-2 gap-4 xl:grid-cols-4'>
        {tiles.map(({ key, value, tone, Icon, onClick }) => (
          <button
            type='button'
            key={key}
            onClick={onClick}
            className={
              'qc-tone qc-tone-' +
              tone +
              ' qc-lift flex items-center justify-between rounded-xl border p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring'
            }
          >
            <span>
              <span className='text-sm'>{t('qc.now.' + key)}</span>
              <strong className='mt-1 block text-3xl font-semibold tabular-nums'>
                {value}
              </strong>
            </span>
            <Icon className='size-6 opacity-70' />
          </button>
        ))}
      </div>
      <div className='grid items-start gap-6 xl:grid-cols-3'>
        <Card className='qc-card xl:col-span-2'>
          <CardContent className='space-y-4 p-6'>
            <SectionTitle
              icon={<CircleX />}
              title={t('qc.now.failedList') + ' · ' + failed.length}
              description={
                notRun > 0
                  ? t('qc.now.notRun') + ' ' + notRun
                  : t('qc.scoreRule')
              }
            />
            {failed.length ? (
              <ul className='divide-y rounded-xl border'>
                {failed.map((r) => {
                  const item = itemForResult(workItems, r);
                  const reason = item ? null : skipReason(detail, r);
                  return (
                    <li key={r.id}>
                      <button
                        type='button'
                        onClick={() => openCell(r)}
                        className='flex w-full flex-wrap items-start justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none'
                      >
                        <span className='min-w-0 flex-1'>
                          <span className='block font-medium'>{name(r)}</span>
                          {r.note && (
                            <span className='mt-1 block truncate text-sm text-muted-foreground'>
                              {r.note}
                            </span>
                          )}
                        </span>
                        {item ? (
                          <Badge
                            variant='outline'
                            className={
                              'qc-tone ' +
                              (item.status === 'open'
                                ? 'qc-tone-warn'
                                : 'qc-tone-muted')
                            }
                          >
                            {t('qc.workKind.' + item.kind)} ·{' '}
                            {t('qc.workStatus.' + item.status)}
                          </Badge>
                        ) : (
                          reason && (
                            <span className='text-xs text-muted-foreground'>
                              {t('qc.skip.' + reason)}
                            </span>
                          )
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className='flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground'>
                <CircleCheck className='size-4' />
                {t('qc.now.noFailed')}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className='qc-card'>
          <CardContent className='space-y-4 p-6'>
            <SectionTitle
              icon={<History />}
              title={t('qc.now.compare')}
              description={
                previous
                  ? t('qc.now.compareWith', { key: previous.run.key })
                  : t('qc.now.noPrevious')
              }
            />
            {diff &&
              (diff.newlyFailed.length ||
              diff.recovered.length ||
              diff.stillFailed.length ? (
                (
                  [
                    ['newlyFailed', diff.newlyFailed, TrendingDown, 'bad'],
                    ['recovered', diff.recovered, TrendingUp, 'good'],
                    ['stillFailed', diff.stillFailed, CircleDashed, 'muted'],
                  ] as const
                ).map(([key, rows, Icon, tone]) =>
                  rows.length ? (
                    <section key={key} className='space-y-2'>
                      <h3
                        className={
                          'qc-tone qc-tone-' +
                          tone +
                          ' inline-flex items-center gap-2 rounded-md border px-2 py-0.5 text-xs font-medium'
                        }
                      >
                        <Icon className='size-3.5' />
                        {t('qc.now.' + key)} · {rows.length}
                      </h3>
                      <ul className='space-y-1 text-sm'>
                        {rows.slice(0, 8).map((r) => (
                          <li key={r.id} className='truncate'>
                            {name(r)}
                          </li>
                        ))}
                        {rows.length > 8 && (
                          <li className='text-xs text-muted-foreground'>
                            … {rows.length - 8}
                          </li>
                        )}
                      </ul>
                    </section>
                  ) : null,
                )
              ) : (
                <p className='text-sm text-muted-foreground'>
                  {t('qc.now.nothingChanged')}
                </p>
              ))}
            <Button
              variant='ghost'
              size='sm'
              className='-ml-2'
              onClick={() => go('runs')}
            >
              {t('qc.now.allRuns')}
              <ArrowRight />
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
