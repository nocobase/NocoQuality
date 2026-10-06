// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  cellScore,
  cellTone,
  manualPairs,
  manualSummary,
} from '../../client/pages/quality/model.js';
import type {
  Check,
  Detail,
  ManualStatus,
  Result,
  Standard,
} from '../../client/pages/quality/types.js';

const check = (id: number, scope: Check['scope'] = 'object'): Check => ({
  id,
  projectId: 1,
  objectId: scope === 'shared' ? null : 1,
  scope,
  dimensionId: 1,
  key: 'c' + id,
  name: 'Check ' + id,
  active: true,
  fixMode: 'assign',
  assigneeId: null,
  source: null,
});
const standard = (
  id: number,
  checkId: number,
  version: number,
  judgeMode: Standard['judgeMode'],
): Standard => ({
  id,
  checkId,
  version,
  definition: 'd',
  preconditions: 'p',
  steps: 's',
  passCriteria: 'c',
  evidence: 'e',
  published: true,
  judgeMode,
  command: null,
});
const result = (checkId: number, conclusion: Result['conclusion']): Result => ({
  id: checkId,
  runId: 1,
  checkId,
  standardId: checkId,
  objectId: 1,
  conclusion,
  note: null,
  evidence: null,
  evidencePath: null,
  prUrl: null,
});

// One object in one dimension with two automated Checks (1, 2) and two human-judged ones (3, 4). Check 4 used to be
// automated: its latest version is human-judged.
function detail(states: Partial<Record<number, ManualStatus>> = {}): Detail {
  return {
    project: {
      id: 1,
      key: 'p',
      name: 'P',
      type: 'custom',
      description: '',
      active: true,
    },
    dimensions: [
      { id: 1, projectId: 1, key: 'd', name: 'D', position: 0, active: true },
    ],
    objects: [
      {
        id: 1,
        projectId: 1,
        key: 'o',
        name: 'O',
        category: 'feature',
        description: '',
        active: true,
        testingPaused: false,
        pausedReason: null,
        materials: null,
      },
    ],
    checks: [check(1), check(2), check(3), check(4, 'shared')],
    standards: [
      standard(1, 1, 1, 'agent'),
      standard(2, 2, 1, 'script'),
      standard(3, 3, 1, 'human'),
      standard(4, 4, 1, 'agent'),
      standard(5, 4, 2, 'human'),
    ],
    applicability: [{ id: 1, projectId: 1, objectId: 1, dimensionId: 1 }],
    exclusions: [],
    manualStates: Object.entries(states).map(([checkId, status], i) => ({
      id: i + 1,
      projectId: 1,
      checkId: Number(checkId),
      objectId: 1,
      status: status!,
      note: null,
      createdBy: 'u',
      createdAt: '2026-10-06T00:00:00.000Z',
    })),
  };
}

describe('cell score', () => {
  it('counts passed automated Checks and reviewed human ones over every enabled Check', () => {
    const score = cellScore(
      detail({ 3: 'reviewed', 4: 'rereview' }),
      [result(1, 'passed'), result(2, 'passed')],
      1,
      1,
    )!;
    expect(score).toMatchObject({
      passed: 3,
      expected: 4,
      complete: true,
      manualPending: 1,
      score: 7.5,
    });
    expect(cellTone(score)).toBe('qc-tone-warn');
  });

  it('counts unreviewed and needs-re-review as not passed', () => {
    expect(
      cellScore(
        detail({ 4: 'rereview' }),
        [result(1, 'passed'), result(2, 'passed')],
        1,
        1,
      )!.score,
    ).toBe(5);
  });

  it('waits only for automated results before it is complete', () => {
    const score = cellScore(
      detail({ 3: 'reviewed', 4: 'reviewed' }),
      [result(1, 'failed')],
      1,
      1,
    )!;
    expect(score).toMatchObject({
      complete: false,
      done: 1,
      automated: 2,
      failed: 1,
    });
    expect(cellTone(score)).toBe('qc-tone-bad');
    // Without any automated result the cell has not run.
    expect(cellScore(detail(), [], 1, 1)).toBeNull();
  });

  it('ignores results a run reported for a Check that is human-judged now', () => {
    const score = cellScore(
      detail({ 3: 'reviewed', 4: 'reviewed' }),
      [result(1, 'passed'), result(2, 'passed'), result(4, 'failed')],
      1,
      1,
    )!;
    expect(score).toMatchObject({ failed: 0, score: 10 });
    expect(cellTone(score)).toBe('qc-tone-good');
  });

  it('scores a cell of human-judged Checks without a run', () => {
    const only = detail({ 3: 'reviewed' });
    only.checks = only.checks.filter((c) => c.id >= 3);
    expect(cellScore(only, undefined, 1, 1)).toMatchObject({
      complete: true,
      passed: 1,
      expected: 2,
      score: 5,
    });
  });
});

describe('cells outside the applicable dimensions', () => {
  it('have no score and no human-judged Checks', () => {
    const d = detail({ 3: 'reviewed' });
    d.applicability = [];
    expect(cellScore(d, undefined, 1, 1)).toBeNull();
    expect(manualPairs(d)).toEqual([]);
  });
});

describe('human-judged pairs', () => {
  it('lists every pair with its state, unreviewed by default', () => {
    expect(
      manualPairs(detail({ 3: 'reviewed' })).map((m) => [m.check.id, m.status]),
    ).toEqual([
      [4, 'unreviewed'],
      [3, 'reviewed'],
    ]);
  });

  it('summarises a Check across its objects by its weakest state', () => {
    const d = detail({ 4: 'rereview' });
    expect(manualSummary(d, d.checks[3]!)).toBe('rereview');
    expect(manualSummary(d, d.checks[2]!)).toBe('unreviewed');
  });
});
