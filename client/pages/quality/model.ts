import type { Check, Detail, Result } from './types.js';

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

// A cell's score from one run's results: 10 × passed ÷ enabled Checks, only once every enabled Check has a result.
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
  const passed = rows.filter((r) => r.conclusion === 'passed').length;
  return {
    rows,
    passed,
    total: rows.length,
    expected,
    complete: rows.length >= expected,
    score: Math.round((passed / rows.length) * 100) / 10,
  };
}
