import { useTranslation } from '@nocobase/i18n/client';
import { CircleAlert, ExternalLink, Play, RotateCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { Detail, Result, Run } from './types.js';
import { useRequest } from './use-quality-data.js';
import { useSubmission } from './use-submission.js';
import { runProgress, time } from './model.js';

const STATUS_TONE: Record<string, string> = {
  running: 'qc-tone-primary',
  completed: 'qc-tone-good',
  overdue: 'qc-tone-bad',
};

export function RunStatusBadge({ run }: { run: Run }) {
  const { t } = useTranslation();
  const status = run.displayStatus || run.status;
  return (
    <Badge
      variant='outline'
      className={'qc-tone ' + (STATUS_TONE[status] ?? 'qc-tone-muted')}
    >
      {t('qc.runStatus.' + status, { defaultValue: status })}
    </Badge>
  );
}

export function RunProgress({
  run,
  results,
}: {
  run: Run;
  results: readonly Result[];
}) {
  const { t } = useTranslation();
  const { done, total } = runProgress(run, results);
  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap items-center justify-between gap-2 text-sm'>
        <span className='tabular-nums'>
          {t('qc.runProgressShort', { done, total })}
        </span>
        {run.deadlineAt && run.displayStatus !== 'completed' && (
          <span className='text-xs text-muted-foreground'>
            {t('qc.deadline', { at: time(run.deadlineAt) })}
          </span>
        )}
      </div>
      <Progress
        value={total ? (done / total) * 100 : 0}
        aria-label={t('qc.runProgressShort', { done, total })}
      />
      {run.displayStatus === 'overdue' && (
        <p className='flex items-center gap-2 text-xs text-(--qc-bad) qc-tone-bad'>
          <CircleAlert className='size-4' />
          {t('qc.overdueHint')}
        </p>
      )}
    </div>
  );
}

// Where the run was sent: its NocoProject task, a failed dispatch to retry, or the commands to run by hand.
export function RunDispatch({
  detail,
  run,
  onChanged,
}: {
  detail: Detail;
  run: Run;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { submit, busy, error } = useSubmission();
  const execution = useRequest<{ nocoproject: boolean }>(
    'quality/execution',
    0,
  ).data;
  if (!run.plan) return null;
  if (run.externalTaskId)
    return (
      <p className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
        {run.externalTaskUrl ? (
          <a
            href={run.externalTaskUrl}
            target='_blank'
            rel='noreferrer'
            className='inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline'
          >
            {t('qc.npTask', { key: run.externalTaskKey ?? run.externalTaskId })}
            <ExternalLink className='size-3' />
          </a>
        ) : run.externalTaskKey ? (
          t('qc.npTask', { key: run.externalTaskKey })
        ) : (
          t('qc.npTaskPending')
        )}
      </p>
    );
  if (run.status !== 'running') return null;
  if (run.dispatchError || execution?.nocoproject)
    return (
      <div className='space-y-2'>
        {run.dispatchError && (
          <p className='qc-tone qc-tone-bad rounded-lg border px-3 py-2 text-sm'>
            {t('qc.dispatchFailed', { error: run.dispatchError })}
          </p>
        )}
        {execution?.nocoproject && (
          <Button
            variant='outline'
            size='sm'
            disabled={busy}
            onClick={() =>
              void submit(
                'quality/projects/' +
                  detail.project.id +
                  '/runs/' +
                  run.id +
                  '/dispatch',
                {},
                onChanged,
              )
            }
          >
            <RotateCw />
            {t('qc.retryDispatch')}
          </Button>
        )}
        {error && <p className='text-sm text-destructive'>{error}</p>}
      </div>
    );
  const ids = detail.project.id + ' ' + run.id;
  return (
    <div className='space-y-2 text-sm'>
      <p className='text-muted-foreground'>{t('qc.manualTrigger')}</p>
      <pre className='overflow-x-auto rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs leading-6'>
        {'node ~/nocobase-quality/bin/run-plan.mjs ' +
          ids +
          '\nnode ~/nocobase-quality/bin/report-result.mjs ' +
          ids +
          ' <result.json>\nnode ~/nocobase-quality/bin/finish-run.mjs ' +
          ids}
      </pre>
    </div>
  );
}

// Starts a run with the project's whole plan; refused while another run is still within its deadline.
export function StartRunButton({
  detail,
  running,
  onStarted,
  size = 'default',
}: {
  detail: Detail;
  running: boolean;
  onStarted: (run: Run) => void;
  size?: 'default' | 'sm';
}) {
  const { t } = useTranslation();
  const { submit, busy, error } = useSubmission();
  return (
    <span className='inline-flex flex-col items-end gap-1'>
      <Button
        size={size}
        disabled={busy || running}
        title={running ? t('qc.runInProgress') : undefined}
        onClick={() =>
          void submit<Run>(
            'quality/projects/' + detail.project.id + '/runs',
            {},
            onStarted,
            { RUN_IN_PROGRESS: 'qc.runInProgress', EMPTY_PLAN: 'qc.emptyPlan' },
          )
        }
      >
        <Play />
        {t(busy ? 'qc.startingRun' : 'qc.startRun')}
      </Button>
      {error && (
        <span className='max-w-xs text-right text-xs text-destructive'>
          {error}
        </span>
      )}
    </span>
  );
}
