import { z } from 'zod';
import type { DatabaseManager } from '@nocobase/db';
import { HTTPException } from 'hono/http-exception';
import type { NotificationService } from '@nocobase/app-plugin-notification';
import type {
  Check,
  CheckExclusion,
  Result,
  Run,
  Standard,
  TestObject,
  WorkItem,
} from './types.js';

const text = (max: number) => z.string().max(max);
// The executor's run.json with each result's evidence file inlined, since the server cannot read executor paths.
export const runImportSchema = z.object({
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}-\d{2,}$/),
  status: z.string().max(20),
  executor: text(200).nullable().optional(),
  startedAt: z.string().max(50),
  finishedAt: z.string().max(50).nullable().optional(),
  environment: z.unknown().optional(),
  scope: z.unknown().optional(),
  steps: z.unknown().optional(),
  results: z
    .array(
      z.object({
        checkId: z.number().int().positive(),
        standardId: z.number().int().positive(),
        objectId: z.number().int().positive(),
        conclusion: z.enum(['passed', 'failed']),
        note: text(5000).nullable().optional(),
        evidence: text(200000).nullable().optional(),
        evidencePath: text(500).nullable().optional(),
        prUrl: z.url().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(5000),
});
export type RunImport = z.infer<typeof runImportSchema>;

export async function importRun(
  db: DatabaseManager,
  notification: NotificationService,
  projectId: number,
  input: RunImport,
  userId: string,
) {
  const now = new Date().toISOString();
  const created = await db.transaction(async (conn) => {
    if (
      await conn
        .repository<Run>('qcRuns')
        .exists({ filter: { projectId, key: input.id } })
    )
      throw new HTTPException(409, { message: 'RUN_EXISTS' });
    const checks = new Map(
      (
        await conn
          .repository<Check>('qcChecks')
          .findMany({ filter: { projectId } })
      ).map((c) => [c.id, c]),
    );
    const objects = new Map(
      (
        await conn
          .repository<TestObject>('qcObjects')
          .findMany({ filter: { projectId } })
      ).map((o) => [o.id, o]),
    );
    const exclusions = await conn
      .repository<CheckExclusion>('qcCheckExclusions')
      .findMany({ filter: { projectId } });
    for (const r of input.results) {
      if (!checks.has(r.checkId) || !objects.has(r.objectId))
        throw new HTTPException(400, { message: 'INVALID_RESULT' });
      if (
        !(await conn.repository<Standard>('qcStandards').exists({
          filter: { id: r.standardId, checkId: r.checkId },
        }))
      )
        throw new HTTPException(400, { message: 'INVALID_STANDARD' });
    }
    const run = (
      await conn.repository<Run>('qcRuns').createOne({
        values: {
          projectId,
          key: input.id,
          status: input.status,
          executor: input.executor ?? null,
          startedAt: input.startedAt,
          finishedAt: input.finishedAt ?? null,
          environment: input.environment ?? null,
          scope: input.scope ?? null,
          steps: input.steps ?? null,
          importedAt: now,
          importedBy: userId,
        },
      })
    ).record;
    const items: WorkItem[] = [];
    for (const r of input.results) {
      const result = (
        await conn.repository<Result>('qcResults').createOne({
          values: {
            projectId,
            runId: run.id,
            checkId: r.checkId,
            standardId: r.standardId,
            objectId: r.objectId,
            conclusion: r.conclusion,
            note: r.note ?? null,
            evidence: r.evidence ?? null,
            evidencePath: r.evidencePath ?? null,
            prUrl: r.prUrl ?? null,
          },
        })
      ).record;
      const check = checks.get(r.checkId)!;
      const object = objects.get(r.objectId)!;
      // Objects left out of testing and Checks turned off for an object produce results but no to-do.
      const skipped =
        object.testingPaused ||
        !object.active ||
        !check.active ||
        exclusions.some(
          (e) => e.checkId === check.id && e.objectId === object.id,
        );
      if (r.conclusion !== 'failed' || skipped) continue;
      items.push(
        (
          await conn.repository<WorkItem>('qcWorkItems').createOne({
            values: {
              projectId,
              source: 'run',
              runId: run.id,
              resultId: result.id,
              createdBy: userId,
              checkId: check.id,
              objectId: object.id,
              kind: r.prUrl ? 'pr_review' : 'manual',
              title: check.name + ' · ' + object.name,
              assigneeId: check.assigneeId || userId,
              prUrl: r.prUrl ?? null,
              status: 'open',
              createdAt: now,
              doneAt: null,
              doneBy: null,
            },
          })
        ).record,
      );
    }
    return { run, items };
  });
  // One in-app message per assignee and run, sent after the data is committed.
  const byAssignee = new Map<string, number>();
  for (const item of created.items)
    byAssignee.set(item.assigneeId, (byAssignee.get(item.assigneeId) ?? 0) + 1);
  for (const [assignee, count] of byAssignee)
    await notification.send({
      idempotencyKey: 'qc-run-' + created.run.id + '-' + assignee,
      source: { type: 'quality-run', referenceId: String(created.run.id) },
      messages: {
        inbox: {
          to: assignee,
          title: '质量中心：轮次 ' + input.id + ' 有 ' + count + ' 条待办',
          body: '本轮有不通过的检查结果需要你处理，点击查看待办。',
          target: {
            type: 'route',
            path: '/quality?project=' + projectId + '&view=todo',
          },
        },
      },
    });
  return { run: created.run, workItems: created.items.length };
}
