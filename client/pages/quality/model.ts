import type { Check, Detail, Result, Run, WorkItem } from './types.js';

export type Tone = 'good' | 'warn' | 'bad' | 'muted' | 'primary';

// Only cells whose object and dimension are both visible count; archived objects keep old applicability rows.
export function activeApplicability(detail: Detail) {
  const objects = new Set(detail.objects.map((o) => o.id));
  const dimensions = new Set(detail.dimensions.map((d) => d.id));
  return detail.applicability.filter(
    (a) => objects.has(a.objectId) && dimensions.has(a.dimensionId),
  );
}

export function isExcluded(detail: Detail, checkId: number, objectId: number) {
  return detail.exclusions.some(
    (e) => e.checkId === checkId && e.objectId === objectId,
  );
}

// Objects a shared Check reaches: every visible object its dimension applies to.
export function inheritingObjects(detail: Detail, check: Check) {
  const ids = new Set(
    activeApplicability(detail)
      .filter((a) => a.dimensionId === check.dimensionId)
      .map((a) => a.objectId),
  );
  return detail.objects.filter((o) => ids.has(o.id));
}

// The Checks one object runs in one dimension: inherited shared Checks plus its own.
export function checksFor(
  detail: Detail,
  objectId: number,
  dimensionId: number,
) {
  const shared = detail.checks.filter(
    (c) => c.scope === 'shared' && c.dimensionId === dimensionId,
  );
  return {
    shared,
    enabledShared: shared.filter((c) => !isExcluded(detail, c.id, objectId)),
    own: detail.checks.filter(
      (c) =>
        c.scope !== 'shared' &&
        c.objectId === objectId &&
        c.dimensionId === dimensionId,
    ),
  };
}

export function effectiveCount(
  detail: Detail,
  objectId: number,
  dimensionId: number,
) {
  const { enabledShared, own } = checksFor(detail, objectId, dimensionId);
  return enabledShared.length + own.length;
}

// Applicable cells of objects currently included in testing; paused objects stay defined but are skipped by runs.
export function testedApplicability(detail: Detail) {
  const paused = new Set(
    detail.objects.filter((o) => o.testingPaused).map((o) => o.id),
  );
  return activeApplicability(detail).filter((a) => !paused.has(a.objectId));
}

// A cell's score from one run's results: 10 × passed ÷ enabled Checks, only once every enabled Check has a
// result. A result waiting for human review is not a conclusion yet, so it keeps the cell incomplete.
export function cellScore(
  detail: Detail,
  results: readonly Result[],
  objectId: number,
  dimensionId: number,
) {
  const dimensionOf = new Map(detail.checks.map((c) => [c.id, c.dimensionId]));
  const rows = results.filter(
    (r) =>
      r.objectId === objectId &&
      dimensionOf.get(r.checkId) === dimensionId &&
      !isExcluded(detail, r.checkId, objectId),
  );
  const expected = effectiveCount(detail, objectId, dimensionId);
  if (!rows.length || !expected) return null;
  const concluded = rows.filter((r) => r.reviewStatus !== 'pending');
  const passed = concluded.filter((r) => r.conclusion === 'passed').length;
  return {
    rows,
    passed,
    total: concluded.length,
    pending: rows.length - concluded.length,
    expected,
    complete: concluded.length >= expected,
    score: concluded.length
      ? Math.round((passed / concluded.length) * 100) / 10
      : 0,
  };
}

// Why a not-passed result produced no to-do, judged by the current settings: the object is paused or archived,
// or it turned the Check off.
export function skipReason(detail: Detail, result: Result) {
  const object = detail.objects.find((o) => o.id === result.objectId);
  if (!object) return 'archived';
  if (object.testingPaused) return 'paused';
  if (isExcluded(detail, result.checkId, result.objectId)) return 'disabled';
  if (!detail.checks.some((c) => c.id === result.checkId)) return 'archived';
  return null;
}

// How many of the run's planned pairs have been reported; imported runs are complete as imported.
export function runProgress(run: Run, results: readonly Result[]) {
  const total = run.plan?.length ?? results.length;
  return { done: Math.min(results.length, total), total };
}

export function time(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

// The latest run's conclusion for a Check (on one object, or across all its objects).
export function latestConclusion(
  results: readonly Result[] | undefined,
  checkId: number,
  objectId?: number,
) {
  const rows = (results ?? []).filter(
    (r) =>
      r.checkId === checkId &&
      (objectId === undefined || r.objectId === objectId),
  );
  if (!rows.length) return 'not_run';
  return rows.some((r) => r.conclusion === 'failed') ? 'failed' : 'passed';
}
export function latestVersion(detail: Detail, checkId: number) {
  return Math.max(
    ...detail.standards
      .filter((s) => s.checkId === checkId)
      .map((s) => s.version),
  );
}

// The to-do that covers a result: the one it raised, or the earlier one it continued.
export function itemForResult(items: readonly WorkItem[], result: Result) {
  return items.find(
    (i) => i.resultId === result.id || i.lastResultId === result.id,
  );
}
