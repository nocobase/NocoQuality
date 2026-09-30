import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowRight,
  BookOpen,
  ChartNoAxesColumn,
  CircleCheck,
  CircleDashed,
  FolderOpen,
  History,
  Layers3,
  ListChecks,
  PlugZap,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { Detail, RunDetail, WorkItem } from './types.js';
import { useLatestRun, useRequest } from './use-quality-data.js';
import { effectiveCount, testedApplicability } from './model.js';
import { SectionTitle } from './ui.js';

export function Overview({
  detail,
  go,
  revision,
}: {
  detail: Detail;
  go: (view: string, extra?: Record<string, string>) => void;
  revision: number;
}) {
  const { t } = useTranslation();
  const cells = testedApplicability(detail);
  const covered = cells.filter(
    (a) => effectiveCount(detail, a.objectId, a.dimensionId) > 0,
  ).length;
  const rate = cells.length ? Math.round((covered / cells.length) * 100) : 0;
  const allItems = useRequest<WorkItem[]>(
    'quality/projects/' + detail.project.id + '/work-items?scope=all',
    revision,
  ).data;
  const openAll = Array.isArray(allItems)
    ? allItems.filter((i) => i.status === 'open')
    : [];
  const metrics = [
    {
      label: t('qc.objects'),
      value: detail.objects.length,
      hint:
        t('qc.categoryCount', {
          count: new Set(detail.objects.map((o) => o.category)).size,
        }) +
        (detail.objects.some((o) => o.testingPaused)
          ? ' · ' +
            t('qc.pausedCount', {
              count: detail.objects.filter((o) => o.testingPaused).length,
            })
          : ''),
      Icon: FolderOpen,
      next: 'configuration',
    },
    {
      label: t('qc.dimensions'),
      value: detail.dimensions.length,
      hint: detail.dimensions.map((d) => d.name).join(' · '),
      Icon: Layers3,
      next: 'configuration',
    },
    {
      label: t('qc.checks'),
      value: detail.checks.length,
      hint: t('qc.versionCount', { count: detail.standards.length }),
      Icon: BookOpen,
      next: 'checks',
    },
    {
      label: t('qc.tasks'),
      value: openAll.length,
      hint: t('qc.taskHint', {
        pr: openAll.filter((i) => i.kind === 'pr_review').length,
        manual: openAll.filter((i) => i.kind === 'manual').length,
      }),
      Icon: Workflow,
      next: 'tasks',
    },
  ];
  const latest = useLatestRun(detail.project.id, revision);
  const openItems =
    latest?.workItems.filter((i) => i.status === 'open').length ?? 0;
  const steps = [
    ['stepDefine', detail.checks.length > 0, 'checks'],
    ['stepTask', !!latest, 'runs'],
    ['stepEvidence', !!latest?.results.length, 'runs'],
    ['stepReview', !!latest && openItems === 0, 'todo'],
  ] as const;
  const done = steps.filter((s) => s[1]).length;
  return (
    <>
      <section className='qc-hero qc-card relative overflow-hidden rounded-2xl border p-6 md:p-7'>
        <div className='relative z-10 grid gap-6 lg:grid-cols-[1fr_minmax(16rem,22rem)] lg:items-center'>
          <div className='min-w-0'>
            <div className='mb-4 flex flex-wrap gap-2'>
              <Badge variant='outline' className='qc-tone qc-tone-primary'>
                <Layers3 />
                {t('qc.dimensionCount', { count: detail.dimensions.length })}
              </Badge>
              <Badge variant='outline' className='qc-tone qc-tone-warn'>
                <PlugZap />
                {t('qc.executorOff')}
              </Badge>
            </div>
            <h2 className='text-2xl font-semibold tracking-tight md:text-3xl'>
              {detail.project.name}
            </h2>
            <p className='mt-3 max-w-2xl text-sm leading-7 text-muted-foreground'>
              {detail.project.description || t('qc.heroBody')}
            </p>
            <div className='mt-5 flex flex-wrap gap-3'>
              <Button onClick={() => go('coverage')}>
                {t('qc.allCoverage')}
                <ArrowRight />
              </Button>
              <Button variant='outline' onClick={() => go('checks')}>
                <BookOpen />
                {t('qc.checks')}
              </Button>
            </div>
          </div>
          <div className='rounded-xl border bg-card/80 p-5 backdrop-blur-sm'>
            <p className='text-sm text-muted-foreground'>
              {t('qc.coverageRate')}
            </p>
            <p className='mt-2 flex items-baseline gap-1'>
              <strong className='text-4xl font-semibold tabular-nums'>
                {rate}
              </strong>
              <span className='text-muted-foreground'>%</span>
            </p>
            <Progress
              value={rate}
              className='mt-4'
              aria-label={t('qc.coverageRate')}
            />
            <p className='mt-3 text-xs leading-5 text-muted-foreground'>
              {t('qc.coverageDetail', { done: covered, total: cells.length })}
            </p>
          </div>
        </div>
      </section>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        {metrics.map(({ label, value, hint, Icon, next }) => (
          <Card
            key={label}
            className='qc-card qc-lift cursor-pointer'
            role='link'
            tabIndex={0}
            onClick={() => go(next)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') go(next);
            }}
          >
            <CardContent className='p-5'>
              <div className='flex items-center justify-between'>
                <span className='text-sm text-muted-foreground'>{label}</span>
                <span className='qc-icon-tile rounded-lg p-2'>
                  <Icon className='size-4' />
                </span>
              </div>
              <strong className='mt-3 block text-3xl font-semibold tabular-nums'>
                {value}
              </strong>
              <p className='mt-2 truncate text-xs text-muted-foreground'>
                {hint}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className='grid gap-6 xl:grid-cols-3'>
        <Card className='qc-card xl:col-span-2'>
          <CardContent className='space-y-5 p-6'>
            <SectionTitle
              icon={<ChartNoAxesColumn />}
              title={t('qc.dimensionCoverage')}
              description={t('qc.dimensionCoverageBody')}
            />
            <div className='space-y-4'>
              {detail.dimensions.map((d) => {
                const own = cells.filter((a) => a.dimensionId === d.id);
                const withChecks = own.filter(
                  (a) => effectiveCount(detail, a.objectId, d.id) > 0,
                ).length;
                return (
                  <button
                    type='button'
                    key={d.id}
                    className='block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    onClick={() => go('checks', { dimension: String(d.id) })}
                  >
                    <span className='mb-2 flex items-center justify-between gap-3 text-sm'>
                      <span className='font-medium'>{d.name}</span>
                      <span className='text-xs tabular-nums text-muted-foreground'>
                        {t('qc.objectsWithChecks', {
                          done: withChecks,
                          total: own.length,
                        })}
                      </span>
                    </span>
                    <Progress
                      value={own.length ? (withChecks / own.length) * 100 : 0}
                      aria-label={d.name}
                    />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
        <Card className='qc-card'>
          <CardContent className='space-y-5 p-6'>
            <SectionTitle
              icon={<ListChecks />}
              title={t('qc.loop')}
              description={t('qc.loopDone', { done, total: steps.length })}
            />
            <Progress
              value={(done / steps.length) * 100}
              aria-label={t('qc.loop')}
            />
            <ol className='space-y-1'>
              {steps.map(([key, ok, next], i) => (
                <li key={key}>
                  <Button
                    variant='ghost'
                    className='h-auto w-full justify-start gap-3 whitespace-normal py-2.5 text-left'
                    onClick={() => go(next)}
                  >
                    {ok ? (
                      <CircleCheck className='qc-tone-good size-5 shrink-0 text-(--qc-fg)' />
                    ) : (
                      <CircleDashed className='size-5 shrink-0 text-muted-foreground' />
                    )}
                    <span className={ok ? 'text-muted-foreground' : ''}>
                      <span className='mr-2 font-mono text-xs'>0{i + 1}</span>
                      {t('qc.' + key)}
                    </span>
                  </Button>
                </li>
              ))}
            </ol>
            <p className='border-t pt-4 text-xs leading-6 text-muted-foreground'>
              {t('qc.executorNote')}
            </p>
          </CardContent>
        </Card>
      </div>
      <div className='grid gap-6 xl:grid-cols-3'>
        <LatestRunCard go={go} latest={latest} />
      </div>
    </>
  );
}

function LatestRunCard({
  go,
  latest,
}: {
  go: (view: string, extra?: Record<string, string>) => void;
  latest?: RunDetail;
}) {
  const { t } = useTranslation();
  const passed =
    latest?.results.filter((r) => r.conclusion === 'passed').length ?? 0;
  const failed = (latest?.results.length ?? 0) - passed;
  const open = latest?.workItems.filter((i) => i.status === 'open').length ?? 0;
  return (
    <Card className='qc-card xl:col-span-3'>
      <CardContent className='space-y-4 p-6'>
        <SectionTitle
          icon={<History />}
          title={t('qc.latestRun')}
          description={latest ? latest.run.key : t('qc.latestRunEmpty')}
          action={
            <div className='flex gap-2'>
              <Button variant='ghost' size='sm' onClick={() => go('runs')}>
                {t('qc.runs')}
                <ArrowRight />
              </Button>
              {latest && (
                <Button
                  size='sm'
                  onClick={() => go('run', { record: String(latest.run.id) })}
                >
                  {t('qc.openRun')}
                </Button>
              )}
            </div>
          }
        />
        {latest && (
          <div className='grid gap-3 sm:grid-cols-3'>
            {(
              [
                ['runPassed', passed, 'good'],
                ['runFailed', failed, failed ? 'bad' : 'muted'],
                ['runOpenItems', open, open ? 'warn' : 'muted'],
              ] as const
            ).map(([key, value, tone]) => (
              <button
                type='button'
                key={key}
                className={
                  'qc-tone qc-tone-' + tone + ' rounded-xl border p-4 text-left'
                }
                onClick={() =>
                  key === 'runOpenItems'
                    ? go('todo')
                    : go('run', { record: String(latest.run.id) })
                }
              >
                <span className='text-xs'>{t('qc.' + key)}</span>
                <strong className='mt-1 block text-2xl tabular-nums'>
                  {value}
                </strong>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
