import { z } from 'zod';
import type { DatabaseManager } from '@nocobase/db';
import { HTTPException } from 'hono/http-exception';
import type { NotificationService } from '@nocobase/app-plugin-notification';
import type {
  Applicability,
  Check,
  CheckExclusion,
  PlanItem,
  Result,
  Run,
  Standard,
  TestObject,
  WorkItem,
} from './types.js';

// A run started in NocoQuality: the server fixes the plan, the executor reports each pair as it finishes,
// and finishing the run notifies assignees. Imported runs (runs/import) keep working without a plan.

type Conn = Pick<DatabaseManager, 'repository'>;

const text = (max: number) => z.string().max(max);
export const resultReportSchema = z
  .object({
    checkId: z.number().int().positive(),
    objectId: z.number().int().positive(),
    conclusion: z.enum(['passed', 'failed']),
    note: text(5000).nullable().optional(),
    evidence: z.string().trim().min(1).max(200000),
    evidencePath: text(500).nullable().optional(),
    prUrl: z.url().max(500).nullable().optional(),
    // The tested revisions; stored on the run the first time any result carries them.
    environment: z.record(z.string(), z.unknown()).optional(),
    executor: text(200).optional(),
  })
  .strict();
export type ResultReport = z.infer<typeof resultReportSchema>;

export const runFinishSchema = z
  .object({
    environment: z.record(z.string(), z.unknown()).optional(),
    steps: z.array(z.record(z.string(), z.unknown())).max(2000).optional(),
    executor: text(200).optional(),
  })
  .strict();
export type RunFinish = z.infer<typeof runFinishSchema>;

export const reviewSchema = z
  .object({
    conclusion: z.enum(['passed', 'failed']),
    note: z.string().trim().max(5000).optional(),
  })
  .strict();
export type Review = z.infer<typeof reviewSchema>;

// Every enabled Check on every object it applies to, minus paused objects and objects that turned it off.
export async function buildPlan(conn: Conn, projectId: number) {
  const checks = await conn
    .repository<Check>('qcChecks')
    .findMany({ filter: { projectId, active: true } });
  const objects = new Map(
    (
      await conn
        .repository<TestObject>('qcObjects')
        .findMany({ filter: { projectId, active: true } })
    )
      .filter((o) => !o.testingPaused)
      .map((o) => [o.id, o]),
  );
  const applicability = await conn
    .repository<Applicability>('qcApplicability')
    .findMany({ filter: { projectId } });
  const exclusions = await conn
    .repository<CheckExclusion>('qcCheckExclusions')
    .findMany({ filter: { projectId } });
  const plan: PlanItem[] = [];
  for (const check of checks.sort((a, b) => a.id - b.id)) {
    const versions = await conn
      .repository<Standard>('qcStandards')
      .findMany({ filter: { checkId: check.id, published: true } });
    if (!versions.length) continue;
    const standard = versions.reduce((a, b) => (b.version > a.version ? b : a));
    const targets = applicability
      .filter(
        (a) =>
          a.dimensionId === check.dimensionId &&
          objects.has(a.objectId) &&
          (check.scope === 'shared' || a.objectId === check.objectId) &&
          !exclusions.some(
            (e) => e.checkId === check.id && e.objectId === a.objectId,
          ),
      )
      .map((a) => a.objectId);
    for (const objectId of [...new Set(targets)].sort((a, b) => a - b))
      plan.push({ checkId: check.id, objectId, standardId: standard.id });
  }
  return plan;
}

export function displayStatus(run: Run, now = Date.now()) {
  if (
    run.status === 'running' &&
    run.deadlineAt &&
    Date.parse(run.deadlineAt) < now
  )
    return 'overdue';
  return run.status;
}

// Keys follow the executor's directory names: the date in China time and a two-digit sequence.
async function nextRunKey(conn: Conn, projectId: number, now: Date) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
  }).format(now);
  const keys = (
    await conn.repository<Run>('qcRuns').findMany({ filter: { projectId } })
  )
    .map((r) => r.key)
    .filter((k) => k.startsWith(day + '-'));
  const next =
    Math.max(0, ...keys.map((k) => Number(k.slice(day.length + 1)) || 0)) + 1;
  return day + '-' + String(next).padStart(2, '0');
}

export async function startRun(
  db: DatabaseManager,
  projectId: number,
  userId: string,
  deadlineHours: number,
) {
  return db.transaction(async (conn) => {
    const now = new Date();
    const running = await conn
      .repository<Run>('qcRuns')
      .findMany({ filter: { projectId, status: 'running' } });
    if (running.some((r) => displayStatus(r, now.getTime()) === 'running'))
      throw new HTTPException(409, { message: 'RUN_IN_PROGRESS' });
    const plan = await buildPlan(conn, projectId);
    if (!plan.length) throw new HTTPException(400, { message: 'EMPTY_PLAN' });
    return (
      await conn.repository<Run>('qcRuns').createOne({
        values: {
          projectId,
          key: await nextRunKey(conn, projectId, now),
          status: 'running',
          executor: null,
          startedAt: now.toISOString(),
          finishedAt: null,
          environment: null,
          scope: { kind: 'full' },
          steps: null,
          importedAt: now.toISOString(),
          importedBy: userId,
          plan,
          deadlineAt: new Date(
            now.getTime() + deadlineHours * 3600_000,
          ).toISOString(),
          triggeredBy: userId,
          externalTaskId: null,
          externalTaskKey: null,
          externalTaskUrl: null,
          dispatchError: null,
        },
      })
    ).record;
  });
}

async function findRun(conn: Conn, projectId: number, runId: number) {
  const run = await conn
    .repository<Run>('qcRuns')
    .findOne({ filter: { id: runId, projectId } });
  if (!run) throw new HTTPException(404, { message: 'RUN_NOT_FOUND' });
  return run;
}

// Keeps one to-do per Check × object in step with its results: a review to-do while a person must confirm a result,
// a PR review or manual to-do while it fails, and done (by the system) once the result it tracks passes or is
// skipped. A later run that fails a pair with an open to-do updates that to-do (lastRunId, lastResultId, occurrences)
// instead of adding another, and keeps its PR when the new result brings none. A to-do someone marked done stays done;
// the next failure of that pair opens a new one.
async function syncWorkItem(
  conn: Conn,
  run: Run,
  result: Result,
  actor: string,
) {
  const check = await conn
    .repository<Check>('qcChecks')
    .findOne({ filter: { id: result.checkId } });
  const object = await conn
    .repository<TestObject>('qcObjects')
    .findOne({ filter: { id: result.objectId } });
  const excluded = await conn
    .repository<CheckExclusion>('qcCheckExclusions')
    .exists({ filter: { checkId: result.checkId, objectId: result.objectId } });
  const skipped =
    !check?.active || !object?.active || object.testingPaused || excluded;
  const repo = conn.repository<WorkItem>('qcWorkItems');
  // The to-do this result already belongs to: raised by it, or last updated by it.
  const own =
    (await repo.findOne({ filter: { resultId: result.id } })) ??
    (await repo.findOne({ filter: { lastResultId: result.id } }));
  // An open to-do for the same pair from an earlier result, which this result continues.
  const open = own
    ? undefined
    : (
        await repo.findMany({
          filter: {
            projectId: run.projectId,
            source: 'run',
            checkId: result.checkId,
            objectId: result.objectId,
            status: 'open',
          },
        })
      ).sort((x, y) => y.id - x.id)[0];
  const prUrl = result.prUrl ?? own?.prUrl ?? open?.prUrl ?? null;
  const kind: WorkItem['kind'] | null = skipped
    ? null
    : result.reviewStatus === 'pending'
      ? 'review'
      : result.conclusion === 'failed'
        ? prUrl
          ? 'pr_review'
          : 'manual'
        : null;
  const now = new Date().toISOString();
  if (kind) {
    const values = {
      kind,
      title:
        (kind === 'review' ? '复核：' : '') +
        check!.name +
        ' · ' +
        object!.name,
      assigneeId: check!.assigneeId || run.triggeredBy || actor,
      prUrl,
      ...(result.prUrl ? { prState: 'open' as const } : {}),
      lastRunId: run.id,
      lastResultId: result.id,
      lastSeenAt: now,
    };
    if (own) {
      if (own.status === 'open')
        await repo.updateOne({ filter: { id: own.id }, values });
    } else if (open)
      await repo.updateOne({
        filter: { id: open.id },
        values: {
          ...values,
          occurrences: (open.occurrences ?? 1) + 1,
          prState: result.prUrl ? 'open' : open.prState,
        },
      });
    else
      await repo.createOne({
        values: {
          ...values,
          prState: prUrl ? 'open' : null,
          projectId: run.projectId,
          source: 'run',
          runId: run.id,
          resultId: result.id,
          checkId: result.checkId,
          objectId: result.objectId,
          occurrences: 1,
          status: 'open',
          createdAt: now,
          createdBy: actor,
          doneAt: null,
          doneBy: null,
        },
      });
  } else if (own?.status === 'open')
    await repo.updateOne({
      filter: { id: own.id },
      values: { status: 'done', doneAt: now, doneBy: 'system' },
    });
}

export async function recordResult(
  db: DatabaseManager,
  projectId: number,
  runId: number,
  input: ResultReport,
  actor: string,
) {
  return db.transaction(async (conn) => {
    const run = await findRun(conn, projectId, runId);
    if (!run.plan) throw new HTTPException(409, { message: 'RUN_HAS_NO_PLAN' });
    if (run.status !== 'running')
      throw new HTTPException(409, { message: 'RUN_FINISHED' });
    const item = run.plan.find(
      (p) => p.checkId === input.checkId && p.objectId === input.objectId,
    );
    if (!item) throw new HTTPException(400, { message: 'NOT_IN_PLAN' });
    const standard = await conn
      .repository<Standard>('qcStandards')
      .findOne({ filter: { id: item.standardId } });
    const now = new Date().toISOString();
    const values = {
      standardId: item.standardId,
      conclusion: input.conclusion,
      reportedConclusion: input.conclusion,
      // New evidence needs a fresh review.
      reviewStatus: standard?.humanReview ? 'pending' : null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      note: input.note ?? null,
      evidence: input.evidence,
      evidencePath: input.evidencePath ?? null,
      prUrl: input.prUrl ?? null,
      reportedAt: now,
    } as const;
    const repo = conn.repository<Result>('qcResults');
    const key = { runId, checkId: input.checkId, objectId: input.objectId };
    const existing = await repo.findOne({ filter: key });
    const result = existing
      ? (await repo.updateOne({ filter: { id: existing.id }, values })).record
      : (
          await repo.createOne({
            values: { ...key, projectId, ...values },
          })
        ).record;
    if (
      (input.environment && !run.environment) ||
      (input.executor && !run.executor)
    )
      await conn.repository<Run>('qcRuns').updateOne({
        filter: { id: runId },
        values: {
          ...(input.environment && !run.environment
            ? { environment: input.environment }
            : {}),
          ...(input.executor && !run.executor
            ? { executor: input.executor }
            : {}),
        },
      });
    await syncWorkItem(conn, run, result, actor);
    const done = await repo.count({ filter: { runId } });
    return { result, progress: { done, total: run.plan.length } };
  });
}

export async function reviewResult(
  db: DatabaseManager,
  projectId: number,
  runId: number,
  resultId: number,
  input: Review,
  actor: string,
) {
  return db.transaction(async (conn) => {
    const run = await findRun(conn, projectId, runId);
    const repo = conn.repository<Result>('qcResults');
    const existing = await repo.findOne({
      filter: { id: resultId, runId, projectId },
    });
    if (!existing)
      throw new HTTPException(404, { message: 'RESULT_NOT_FOUND' });
    if (!existing.reviewStatus)
      throw new HTTPException(409, { message: 'REVIEW_NOT_REQUIRED' });
    const result = (
      await repo.updateOne({
        filter: { id: resultId },
        values: {
          conclusion: input.conclusion,
          reviewStatus: 'confirmed',
          reviewedBy: actor,
          reviewedAt: new Date().toISOString(),
          reviewNote: input.note || null,
        },
      })
    ).record;
    await syncWorkItem(conn, run, result, actor);
    return result;
  });
}

export async function finishRun(
  db: DatabaseManager,
  notification: NotificationService,
  projectId: number,
  runId: number,
  input: RunFinish,
) {
  const outcome = await db.transaction(async (conn) => {
    const run = await findRun(conn, projectId, runId);
    if (!run.plan) throw new HTTPException(409, { message: 'RUN_HAS_NO_PLAN' });
    if (run.status !== 'running') return { run, notify: false };
    const updated = (
      await conn.repository<Run>('qcRuns').updateOne({
        filter: { id: runId },
        values: {
          status: 'completed',
          finishedAt: new Date().toISOString(),
          ...(input.environment ? { environment: input.environment } : {}),
          ...(input.steps ? { steps: input.steps } : {}),
          ...(input.executor ? { executor: input.executor } : {}),
        },
      })
    ).record;
    return { run: updated, notify: true };
  });
  if (outcome.notify) {
    // One in-app message per assignee and run, after the data is committed.
    const open = await db
      .repository<WorkItem>('qcWorkItems')
      .findMany({ filter: { runId, status: 'open' } });
    const byAssignee = new Map<string, number>();
    for (const item of open)
      byAssignee.set(
        item.assigneeId,
        (byAssignee.get(item.assigneeId) ?? 0) + 1,
      );
    for (const [assignee, count] of byAssignee)
      await notification.send({
        idempotencyKey: 'qc-run-' + runId + '-' + assignee,
        source: { type: 'quality-run', referenceId: String(runId) },
        messages: {
          inbox: {
            to: assignee,
            title:
              '质量中心：轮次 ' + outcome.run.key + ' 有 ' + count + ' 条待办',
            body: '本轮有不通过或待复核的检查结果需要你处理，点击查看待办。',
            target: {
              type: 'route',
              path: '/quality?project=' + projectId + '&view=todo',
            },
          },
        },
      });
  }
  return outcome.run;
}
