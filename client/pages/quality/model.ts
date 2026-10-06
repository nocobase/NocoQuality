import type {
  Check,
  Detail,
  ManualState,
  ManualStatus,
  Result,
  Run,
  WorkItem,
} from './types.js';

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

// A Check is judged by a person when its latest standard says so; runs leave it out.
export function isManual(detail: Detail, checkId: number) {
  const versions = detail.standards.filter((s) => s.checkId === checkId);
  if (!versions.length) return false;
  return (
    versions.reduce((a, b) => (b.version > a.version ? b : a)).judgeMode ===
    'human'
  );
}

export function manualStateOf(
  detail: Detail,
  checkId: number,
  objectId: number,
): ManualState | undefined {
  return detail.manualStates.find(
    (m) => m.checkId === checkId && m.objectId === objectId,
  );
}

export function manualStatus(
  detail: Detail,
  checkId: number,
  objectId: number,
): ManualStatus {
  return manualStateOf(detail, checkId, objectId)?.status ?? 'unreviewed';
}

// Whether the dimension applies to the object; a cell outside it has no Checks to judge.
export function isApplicable(
  detail: Detail,
  objectId: number,
  dimensionId: number,
) {
  return detail.applicability.some(
    (a) => a.objectId === objectId && a.dimensionId === dimensionId,
  );
}

// The human-judged Checks of one applicable cell with their current state.
export function manualChecksFor(
  detail: Detail,
  objectId: number,
  dimensionId: number,
) {
  if (!isApplicable(detail, objectId, dimensionId)) return [];
  const { enabledShared, own } = checksFor(detail, objectId, dimensionId);
  return [...enabledShared, ...own]
    .filter((check) => isManual(detail, check.id))
    .map((check) => ({
      check,
      objectId,
      state: manualStateOf(detail, check.id, objectId),
      status: manualStatus(detail, check.id, objectId),
    }));
}

// Every human-judged Check × object of the objects currently in testing.
export function manualPairs(detail: Detail) {
  return testedApplicability(detail).flatMap((a) =>
    manualChecksFor(detail, a.objectId, a.dimensionId),
  );
}

// One state for a human-judged Check across the objects it reaches: needs re-review or not reviewed when any object
// is, reviewed only when all are.
export function manualSummary(
  detail: Detail,
  check: Check,
  objectId?: number,
): ManualStatus {
  const objects =
    objectId !== undefined
      ? [objectId]
      : check.scope === 'shared'
        ? inheritingObjects(detail, check)
            .filter((o) => !isExcluded(detail, check.id, o.id))
            .map((o) => o.id)
        : [check.objectId!];
  const statuses = objects.map((o) => manualStatus(detail, check.id, o));
  if (statuses.includes('rereview')) return 'rereview';
  if (!statuses.length || statuses.includes('unreviewed')) return 'unreviewed';
  return 'reviewed';
}

// A cell's score: 10 × (automated Checks passed in the run + human-judged Checks currently reviewed) ÷ enabled
// Checks. Unreviewed and waiting-for-rereview count as not passed. The score is complete once every automated Check
// has a result in the run; a cell with only human-judged Checks needs no run.
export function cellScore(
  detail: Detail,
  results: readonly Result[] | undefined,
  objectId: number,
  dimensionId: number,
) {
  if (!isApplicable(detail, objectId, dimensionId)) return null;
  const { enabledShared, own } = checksFor(detail, objectId, dimensionId);
  const expected = enabledShared.length + own.length;
  if (!expected) return null;
  const manual = manualChecksFor(detail, objectId, dimensionId);
  const automated = new Set(
    [...enabledShared, ...own]
      .filter((c) => !manual.some((m) => m.check.id === c.id))
      .map((c) => c.id),
  );
  // Results of a Check that is human-judged now no longer count.
  const rows = (results ?? []).filter(
    (r) => r.objectId === objectId && automated.has(r.checkId),
  );
  if (automated.size && !rows.length) return null;
  const reviewed = manual.filter((m) => m.status === 'reviewed').length;
  const passed =
    rows.filter((r) => r.conclusion === 'passed').length + reviewed;
  return {
    rows,
    manual,
    passed,
    failed: rows.filter((r) => r.conclusion === 'failed').length,
    manualPending: manual.length - reviewed,
    done: rows.length,
    automated: automated.size,
    expected,
    complete: rows.length >= automated.size,
    score: Math.round((passed / expected) * 100) / 10,
  };
}
export type CellScore = NonNullable<ReturnType<typeof cellScore>>;

export function cellTone(score: CellScore) {
  if (score.failed) return 'qc-tone-bad';
  if (!score.complete) return 'qc-tone-muted';
  return score.manualPending ? 'qc-tone-warn' : 'qc-tone-good';
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
