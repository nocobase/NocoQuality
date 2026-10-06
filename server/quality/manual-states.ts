import { z } from 'zod';
import type { DatabaseManager } from '@nocobase/db';
import { HTTPException } from 'hono/http-exception';
import type {
  Applicability,
  Check,
  CheckExclusion,
  ManualState,
  Standard,
  TestObject,
} from './types.js';

// A human-judged Check is not run. A person keeps its state on each object it applies to: unreviewed until someone
// records otherwise, reviewed, or waiting to be reviewed again. Every change adds a row, so the history stays.

type Conn = Pick<DatabaseManager, 'repository'>;

const id = z.number().int().positive();
export const manualStateSchema = z
  .object({
    items: z
      .array(z.object({ checkId: id, objectId: id }).strict())
      .min(1)
      .max(1000),
    status: z.enum(['unreviewed', 'reviewed', 'rereview']),
    note: z.string().trim().max(5000).optional(),
  })
  .strict();
export type ManualStateInput = z.infer<typeof manualStateSchema>;

// Whether a Check is judged by a person, by its latest published standard.
export async function isHumanJudged(conn: Conn, checkId: number) {
  const versions = await conn
    .repository<Standard>('qcStandards')
    .findMany({ filter: { checkId, published: true } });
  if (!versions.length) return false;
  return (
    versions.reduce((a, b) => (b.version > a.version ? b : a)).judgeMode ===
    'human'
  );
}

// The latest row of each Check × object; a pair without one is unreviewed.
export function currentStates(rows: readonly ManualState[]) {
  const latest = new Map<string, ManualState>();
  for (const row of [...rows].sort((a, b) => a.id - b.id))
    latest.set(row.checkId + ':' + row.objectId, row);
  return [...latest.values()];
}

export async function listManualStates(db: DatabaseManager, projectId: number) {
  return currentStates(
    await db
      .repository<ManualState>('qcManualStates')
      .findMany({ filter: { projectId } }),
  );
}

// Every change of one pair, newest first.
export async function manualStateHistory(
  db: DatabaseManager,
  projectId: number,
  checkId: number,
  objectId: number,
) {
  return (
    await db
      .repository<ManualState>('qcManualStates')
      .findMany({ filter: { projectId, checkId, objectId } })
  ).sort((a, b) => b.id - a.id);
}

// Sets one state on several pairs at once, all or nothing. Each pair must be an enabled human-judged Check on an
// object it applies to.
export async function setManualStates(
  db: DatabaseManager,
  projectId: number,
  input: ManualStateInput,
  actor: string,
) {
  return db.transaction(async (conn) => {
    const pairs = [
      ...new Map(
        input.items.map((p) => [p.checkId + ':' + p.objectId, p]),
      ).values(),
    ];
    const checks = new Map<number, Check>();
    for (const { checkId, objectId } of pairs) {
      if (!checks.has(checkId)) {
        const check = await conn
          .repository<Check>('qcChecks')
          .findOne({ filter: { id: checkId, projectId, active: true } });
        if (!check) throw new HTTPException(400, { message: 'INVALID_CHECK' });
        if (!(await isHumanJudged(conn, checkId)))
          throw new HTTPException(400, { message: 'NOT_MANUAL_CHECK' });
        checks.set(checkId, check);
      }
      const check = checks.get(checkId)!;
      const applies =
        (await conn
          .repository<TestObject>('qcObjects')
          .exists({ filter: { id: objectId, projectId, active: true } })) &&
        (check.scope === 'shared'
          ? (await conn.repository<Applicability>('qcApplicability').exists({
              filter: { projectId, objectId, dimensionId: check.dimensionId },
            })) &&
            !(await conn
              .repository<CheckExclusion>('qcCheckExclusions')
              .exists({ filter: { checkId, objectId } }))
          : check.objectId === objectId);
      if (!applies) throw new HTTPException(400, { message: 'INVALID_OBJECT' });
    }
    const now = new Date().toISOString();
    const rows: ManualState[] = [];
    for (const { checkId, objectId } of pairs)
      rows.push(
        (
          await conn.repository<ManualState>('qcManualStates').createOne({
            values: {
              projectId,
              checkId,
              objectId,
              status: input.status,
              note: input.note || null,
              createdBy: actor,
              createdAt: now,
            },
          })
        ).record,
      );
    return rows;
  });
}
