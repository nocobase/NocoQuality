import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Detail } from '../../client/pages/quality/types.js';
import QualityPage from '../../client/pages/quality/index.js';
const { api } = vi.hoisted(() => ({ api: { request: vi.fn() } }));
vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => api,
  ApiClientError: class extends Error {
    status = 500;
  },
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const detail: Detail = {
  project: {
    id: 10,
    key: 'school',
    name: '学校',
    type: 'custom',
    description: '',
    active: true,
  },
  dimensions: [
    {
      id: 11,
      projectId: 10,
      key: 'flow',
      name: '流程完整性',
      position: 0,
      active: true,
    },
  ],
  objects: [
    {
      id: 12,
      projectId: 10,
      key: 'card',
      name: '饭卡',
      category: 'business',
      description: '',
      active: true,
      testingPaused: false,
      pausedReason: null,
      materials: null,
    },
    {
      id: 13,
      projectId: 10,
      key: 'attendance',
      name: '考勤',
      category: 'business',
      description: '',
      active: true,
      testingPaused: false,
      pausedReason: null,
      materials: null,
    },
  ],
  checks: [
    {
      id: 14,
      projectId: 10,
      objectId: 12,
      scope: 'object',
      fixMode: 'assign',
      assigneeId: null,
      dimensionId: 11,
      key: 'payment',
      name: '充值消费',
      active: true,
      source: null,
    },
  ],
  standards: [
    {
      id: 15,
      checkId: 14,
      version: 1,
      definition: '核对余额',
      preconditions: '测试账号',
      steps: '充值后消费',
      passCriteria: '账实一致',
      evidence: '脱敏流水',
      published: true,
      judgeMode: 'agent',
      command: null,
    },
  ],
  applicability: [{ id: 16, projectId: 10, objectId: 12, dimensionId: 11 }],
  exclusions: [],
  manualStates: [],
};
function show(view: string) {
  return render(
    <MemoryRouter initialEntries={['/quality?project=10&view=' + view]}>
      <QualityPage />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  api.request.mockReset();
  api.request.mockImplementation(async ({ path }: { path: string }) => ({
    data:
      path === 'quality/projects'
        ? [detail.project]
        : path === 'quality/users' || path.endsWith('/runs')
          ? []
          : structuredClone(detail),
  }));
});
afterEach(() => cleanup());
describe('quality workspace', () => {
  it('renders the project dimensions and distinguishes untested from not applicable; a matrix cell drills into its Check', async () => {
    const user = userEvent.setup();
    show('coverage');
    expect(
      await screen.findByRole('columnheader', { name: '流程完整性' }),
    ).toBeVisible();
    expect(screen.getByText('qc.notApplicable')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /qc.notRun/ }));
    expect(
      await screen.findByRole('button', { name: '充值消费' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: '充值消费' }));
    expect(await screen.findByText('核对余额')).toBeVisible();
    expect(screen.getByText('账实一致')).toBeVisible();
    expect(screen.getByText('脱敏流水')).toBeVisible();
  });
  it('keeps Chinese composition and provides a clear action for unmatched search', async () => {
    const user = userEvent.setup();
    show('coverage');
    const input = await screen.findByRole('textbox', {
      name: 'qc.searchObjects',
    });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '不存在' } });
    fireEvent.compositionEnd(input);
    expect(input).toHaveValue('不存在');
    expect(screen.getByText('qc.noMatches')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'qc.clearFilters' }));
    expect(input).toHaveValue('');
    expect(screen.getByText('饭卡')).toBeVisible();
  });
  it('retains standard edits when publishing fails and prevents repeated submits in flight', async () => {
    const user = userEvent.setup();
    let rejectRequest: (reason: Error) => void = () => {};
    api.request.mockImplementation(
      ({ path, method }: { path: string; method?: string }) =>
        method === 'POST'
          ? new Promise((_resolve, reject) => {
              rejectRequest = reject;
            })
          : Promise.resolve({
              data:
                path === 'quality/projects'
                  ? [detail.project]
                  : structuredClone(detail),
            }),
    );
    show('edit-standard&record=14');
    const input = await screen.findByRole('textbox', { name: 'qc.definition' });
    await user.clear(input);
    await user.type(input, 'new definition');
    await user.click(
      screen.getByRole('button', { name: 'qc.save', exact: true }),
    );
    expect(screen.getByRole('button', { name: 'qc.saving' })).toBeDisabled();
    expect(
      api.request.mock.calls.filter(([v]) => v.method === 'POST'),
    ).toHaveLength(1);
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          definition: 'new definition',
          baseVersion: 1,
        }),
      }),
    );
    rejectRequest(new Error('network failed'));
    expect(await screen.findByText('qc.saveError')).toBeVisible();
    expect(input).toHaveValue('new definition');
  });
  it('recovers from a failed project request using retry', async () => {
    let fail = true;
    api.request.mockImplementation(async ({ path }: { path: string }) => {
      if (path !== 'quality/projects' && fail) throw new Error('offline');
      return {
        data:
          path === 'quality/projects'
            ? [detail.project]
            : structuredClone(detail),
      };
    });
    const user = userEvent.setup();
    show('overview');
    expect(await screen.findByText('qc.loadError')).toBeVisible();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'qc.retry' }));
    expect(await screen.findByText('qc.now.noRunTitle')).toBeVisible();
  });
  it('lets every object inherit a dimension-wide Check and turns it off for one object', async () => {
    const withShared = structuredClone(detail);
    withShared.applicability.push({
      id: 17,
      projectId: 10,
      objectId: 13,
      dimensionId: 11,
    });
    withShared.checks.push({
      id: 20,
      projectId: 10,
      objectId: null,
      scope: 'shared',
      fixMode: 'pr',
      assigneeId: null,
      dimensionId: 11,
      key: 'skills',
      name: '提供 Skills',
      active: true,
    });
    withShared.standards.push({
      ...withShared.standards[0],
      id: 21,
      checkId: 20,
    });
    api.request.mockImplementation(
      async ({ path, method }: { path: string; method?: string }) => ({
        data:
          method === 'POST'
            ? {}
            : path === 'quality/projects'
              ? [detail.project]
              : withShared,
      }),
    );
    const user = userEvent.setup();
    show('checks');
    expect(await screen.findByText('qc.reachCount')).toBeVisible();
    cleanup();
    show('checks&object=13&dimension=11');
    const toggle = await screen.findByRole('switch', { name: 'qc.enabledFor' });
    expect(toggle).toBeChecked();
    expect(
      screen.queryByRole('button', { name: '充值消费' }),
    ).not.toBeInTheDocument();
    await user.click(toggle);
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'quality/projects/10/checks/20/exclusions',
          method: 'POST',
          json: { objectId: 13, enabled: false },
        }),
      ),
    );
  });
  it('marks an object as not tested in the matrix and switches it back on from configuration', async () => {
    const paused = structuredClone(detail);
    paused.objects[0].testingPaused = true;
    api.request.mockImplementation(
      async ({ path, method }: { path: string; method?: string }) => ({
        data:
          method === 'POST'
            ? {}
            : path === 'quality/projects'
              ? [detail.project]
              : paused,
      }),
    );
    const user = userEvent.setup();
    show('coverage');
    expect((await screen.findAllByText('qc.paused')).length).toBeGreaterThan(0);
    cleanup();
    show('configuration');
    const toggle = await screen.findAllByRole('switch', {
      name: 'qc.includeInTesting',
    });
    expect(toggle[0]).not.toBeChecked();
    await user.click(toggle[0]);
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'quality/projects/10/objects/12/testing',
          method: 'POST',
          json: { enabled: true },
        }),
      ),
    );
    await user.click(
      screen.getByRole('switch', { name: 'qc.groupTestingToggle' }),
    );
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'quality/projects/10/objects/testing',
          method: 'POST',
          json: { objectIds: [12, 13], enabled: true },
        }),
      ),
    );
  });
  it('shows a run score per cell, opens its results, and completes to-dos in bulk', async () => {
    const run = {
      id: 30,
      projectId: 10,
      key: '2026-09-29-01',
      status: 'completed',
      executor: 'local',
      startedAt: '2026-09-29T10:00:00Z',
      finishedAt: '2026-09-29T11:00:00Z',
      environment: null,
      steps: [],
      importedAt: '2026-09-29T11:00:00Z',
    };
    const results = [
      {
        id: 31,
        runId: 30,
        checkId: 14,
        standardId: 15,
        objectId: 12,
        conclusion: 'failed',
        note: '缺少对账说明',
        evidence: '# 证据\n- 未找到对账页面',
        evidencePath: null,
        prUrl: null,
      },
    ];
    const workItems = [
      {
        id: 32,
        runId: 30,
        runKey: '2026-09-29-01',
        resultId: 31,
        checkId: 14,
        objectId: 12,
        kind: 'manual',
        title: '充值消费 · 饭卡',
        assigneeId: 'u1',
        prUrl: null,
        status: 'open',
        createdAt: '2026-09-29T11:00:00Z',
        doneAt: null,
        doneBy: null,
      },
    ];
    api.request.mockImplementation(
      async ({ path, method }: { path: string; method?: string }) => ({
        data:
          method === 'POST'
            ? { done: 1 }
            : path === 'quality/projects'
              ? [detail.project]
              : path === 'quality/users'
                ? [{ id: 'u1', name: '测试负责人' }]
                : path.endsWith('/runs/30')
                  ? { run, results, workItems }
                  : path.includes('/work-items')
                    ? workItems
                    : path.endsWith('/runs')
                      ? [{ ...run, passed: 0, failed: 1, openItems: 1, prs: 0 }]
                      : structuredClone(detail),
      }),
    );
    const user = userEvent.setup();
    show('run&record=30');
    const cell = await screen.findByRole('button', { name: /0\.0/ });
    await user.click(cell);
    expect(await screen.findByText('缺少对账说明')).toBeVisible();
    expect(screen.getByText('未找到对账页面')).toBeVisible();
    expect(screen.getByText('测试负责人')).toBeVisible();
    cleanup();
    show('coverage');
    await user.click(await screen.findByRole('button', { name: /0\.0/ }));
    expect(await screen.findByText('缺少对账说明')).toBeVisible();
    expect(screen.getByRole('button', { name: /qc.openInRun/ })).toBeVisible();
    cleanup();
    show('todo');
    await user.click(
      await screen.findByRole('checkbox', { name: '充值消费 · 饭卡' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'qc.completeSelected' }),
    );
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'quality/projects/10/work-items/complete',
          method: 'POST',
          json: { ids: [32] },
        }),
      ),
    );
  });
  it('files a to-do by hand with its context and opens any to-do in place', async () => {
    const manual = {
      id: 40,
      source: 'manual',
      runId: null,
      resultId: null,
      checkId: null,
      objectId: null,
      kind: 'pr_review',
      title: 'Skill 缺少迁移说明',
      assigneeId: 'u1',
      prUrl: 'https://github.com/nocobase/nocobase3/pull/1',
      prState: 'open',
      prSyncedAt: null,
      status: 'open',
      createdAt: '2026-09-29T11:00:00Z',
      doneAt: null,
      doneBy: null,
      createdBy: 'u1',
      problem: '修改字段可空时迁移失败',
      scenario: 'db apply',
      actualExpected: null,
      evidence: 'type undefined',
      impact: null,
      handling: '补充 Skill 说明',
    };
    api.request.mockImplementation(
      async ({ path, method }: { path: string; method?: string }) => ({
        data:
          method === 'POST'
            ? { id: 41 }
            : path === 'quality/projects'
              ? [detail.project]
              : path === 'quality/users'
                ? [{ id: 'u1', name: '测试负责人' }]
                : path.endsWith('/work-items/40')
                  ? { item: manual, result: null, run: null }
                  : path.includes('/work-items')
                    ? [manual]
                    : path.endsWith('/runs')
                      ? []
                      : structuredClone(detail),
      }),
    );
    const user = userEvent.setup();
    show('tasks');
    await user.click(await screen.findByText('Skill 缺少迁移说明'));
    expect(await screen.findByText('修改字段可空时迁移失败')).toBeVisible();
    expect(screen.getByText('type undefined')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'qc.markDone' }));
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'quality/projects/10/work-items/complete',
          json: { ids: [40] },
        }),
      ),
    );
    cleanup();
    show('new-work-item');
    await user.type(
      await screen.findByRole('textbox', { name: 'qc.workTitle' }),
      '新问题',
    );
    for (const key of ['problem', 'scenario', 'evidence', 'handling'])
      await user.type(
        screen.getByRole('textbox', { name: 'qc.ctx.' + key }),
        key + ' 内容',
      );
    await user.click(
      screen.getByRole('button', { name: 'qc.save', exact: true }),
    );
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'quality/projects/10/work-items',
          method: 'POST',
          json: expect.objectContaining({
            title: '新问题',
            assigneeId: 'u1',
            problem: 'problem 内容',
            prUrl: null,
          }),
        }),
      ),
    );
  });
  it('leads with the current run: progress, what failed, and starting the next run', async () => {
    const run = {
      id: 50,
      projectId: 10,
      key: '2026-10-04-01',
      status: 'running',
      displayStatus: 'running',
      executor: null,
      startedAt: '2026-10-04T10:00:00Z',
      finishedAt: null,
      environment: null,
      importedAt: '2026-10-04T10:00:00Z',
      plan: [
        { checkId: 14, objectId: 12, standardId: 15 },
        { checkId: 14, objectId: 13, standardId: 15 },
      ],
      deadlineAt: '2026-10-04T22:00:00Z',
      externalTaskId: null,
      dispatchError: null,
    };
    const results = [
      {
        id: 51,
        runId: 50,
        checkId: 14,
        standardId: 15,
        objectId: 12,
        conclusion: 'failed',
        note: '余额与流水不一致',
        evidence: '流水 3 条',
        evidencePath: null,
        prUrl: null,
        reviewStatus: null,
      },
    ];
    api.request.mockImplementation(
      async ({ path, method }: { path: string; method?: string }) => {
        if (method === 'POST')
          return { data: { ...run, id: 60, key: '2026-10-04-02' } };
        return {
          data:
            path === 'quality/projects'
              ? [detail.project]
              : path === 'quality/execution'
                ? { nocoproject: false, deadlineHours: 12 }
                : path.endsWith('/runs')
                  ? [
                      {
                        ...run,
                        expected: 2,
                        passed: 0,
                        failed: 1,
                        openItems: 0,
                        prs: 0,
                      },
                    ]
                  : path.endsWith('/runs/50')
                    ? { run, results, workItems: [] }
                    : path.includes('/work-items') || path === 'quality/users'
                      ? []
                      : structuredClone(detail),
        };
      },
    );
    show('overview');
    expect(await screen.findByText('2026-10-04-01')).toBeVisible();
    expect(screen.getByText('qc.runProgressShort')).toBeVisible();
    expect(screen.getByText('充值消费 · 饭卡')).toBeVisible();
    expect(screen.getByText('余额与流水不一致')).toBeVisible();
    // Without NocoProject the page shows the commands that start the executor by hand.
    expect(await screen.findByText(/run-plan\.mjs 10 50/)).toBeVisible();
    // A run still within its deadline blocks the next one.
    expect(screen.getByRole('button', { name: /qc.startRun/ })).toBeDisabled();
  });
  it('creates a human Check without handling, steps or script', async () => {
    api.request.mockImplementation(
      async ({ path, method }: { path: string; method?: string }) => ({
        data:
          method === 'POST'
            ? { id: 90 }
            : path === 'quality/projects'
              ? [detail.project]
              : path === 'quality/users' || path.endsWith('/runs')
                ? []
                : structuredClone(detail),
      }),
    );
    const user = userEvent.setup();
    show('new-check');
    // Automated is the default: who judges it and how a failure is handled are asked for.
    expect(
      await screen.findByText('qc.fixModeLabel', { selector: 'legend' }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'qc.steps' })).toBeRequired();
    await user.click(screen.getByText('qc.checkKindName.human'));
    expect(
      screen.queryByText('qc.fixModeLabel', { selector: 'legend' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('qc.judgeLabel', { selector: 'legend' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'qc.stepsOptional' }),
    ).not.toBeRequired();
    await user.type(
      screen.getByRole('textbox', { name: 'qc.checkName' }),
      '文档可读',
    );
    for (const key of [
      'definition',
      'preconditions',
      'passCriteria',
      'evidence',
    ])
      await user.type(
        screen.getByRole('textbox', { name: 'qc.' + key }),
        key + ' 内容',
      );
    await user.click(
      screen.getByRole('button', { name: 'qc.save', exact: true }),
    );
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'quality/projects/10/checks',
          method: 'POST',
          json: expect.objectContaining({
            name: '文档可读',
            judgeMode: 'human',
            command: null,
            steps: '',
          }),
        }),
      ),
    );
    const posted = api.request.mock.calls.find(
      ([v]) => v.method === 'POST',
    )![0] as { json: Record<string, unknown> };
    expect(posted.json).not.toHaveProperty('fixMode');
    expect(posted.json).not.toHaveProperty('humanReview');
  });
  it('sends the handling with a new version that makes a Check automated', async () => {
    const human = structuredClone(detail);
    human.standards[0]!.judgeMode = 'human';
    api.request.mockImplementation(
      async ({ path, method }: { path: string; method?: string }) => ({
        data:
          method === 'POST'
            ? {}
            : path === 'quality/projects'
              ? [detail.project]
              : path === 'quality/users' || path.endsWith('/runs')
                ? []
                : human,
      }),
    );
    const user = userEvent.setup();
    show('edit-standard&record=14');
    await screen.findByRole('textbox', { name: 'qc.definition' });
    expect(
      screen.queryByText('qc.fixModeLabel', { selector: 'legend' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByText('qc.checkKindName.automated'));
    await user.click(screen.getByText('qc.fixMode.pr'));
    await user.click(
      screen.getByRole('button', { name: 'qc.save', exact: true }),
    );
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'quality/projects/10/checks/14/versions',
          json: expect.objectContaining({
            judgeMode: 'agent',
            fixMode: 'pr',
            baseVersion: 1,
          }),
        }),
      ),
    );
  });
  it('scores a cell of human Checks without a run and changes a state from the cell', async () => {
    const human = structuredClone(detail);
    human.standards[0]!.judgeMode = 'human';
    api.request.mockImplementation(
      async ({ path, method }: { path: string; method?: string }) => ({
        data:
          method === 'POST'
            ? []
            : path === 'quality/projects'
              ? [detail.project]
              : path === 'quality/users'
                ? [{ id: 'u1', name: '测试负责人' }]
                : path.includes('/manual-states?')
                  ? [
                      {
                        id: 1,
                        projectId: 10,
                        checkId: 14,
                        objectId: 12,
                        status: 'rereview',
                        note: '标准改了',
                        createdBy: 'u1',
                        createdAt: '2026-10-06T08:00:00Z',
                      },
                    ]
                  : path.endsWith('/runs')
                    ? []
                    : human,
      }),
    );
    const user = userEvent.setup();
    show('coverage');
    // Not reviewed counts as not passed.
    await user.click(await screen.findByRole('button', { name: /0\.0/ }));
    expect(
      await screen.findByText('qc.manual.status.unreviewed'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: /qc.manual.history/ }));
    expect(await screen.findByText('标准改了')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'qc.manual.update' }));
    await user.type(
      screen.getByRole('textbox', { name: 'qc.manual.note' }),
      'https://example.com/review/1',
    );
    await user.click(screen.getByRole('button', { name: 'qc.manual.update' }));
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'quality/projects/10/manual-states',
          method: 'POST',
          json: {
            items: [{ checkId: 14, objectId: 12 }],
            status: 'reviewed',
            note: 'https://example.com/review/1',
          },
        }),
      ),
    );
    cleanup();
    human.manualStates = [
      {
        id: 2,
        projectId: 10,
        checkId: 14,
        objectId: 12,
        status: 'reviewed',
        note: null,
        createdBy: 'u1',
        createdAt: '2026-10-06T09:00:00Z',
      },
    ];
    show('coverage');
    expect(await screen.findByRole('button', { name: /10\.0/ })).toBeVisible();
  });
  it('sets the state of human Checks in several cells at once', async () => {
    const human = structuredClone(detail);
    human.standards[0]!.judgeMode = 'human';
    human.applicability.push({
      id: 17,
      projectId: 10,
      objectId: 13,
      dimensionId: 11,
    });
    human.checks.push({
      ...human.checks[0]!,
      id: 20,
      objectId: null,
      scope: 'shared',
      key: 'docs',
      name: '文档可读',
    });
    human.standards.push({ ...human.standards[0]!, id: 21, checkId: 20 });
    api.request.mockImplementation(
      async ({ path, method }: { path: string; method?: string }) => ({
        data:
          method === 'POST'
            ? []
            : path === 'quality/projects'
              ? [detail.project]
              : path === 'quality/users' || path.endsWith('/runs')
                ? []
                : human,
      }),
    );
    const user = userEvent.setup();
    show('coverage');
    await user.click(
      await screen.findByRole('button', { name: /qc.manual.batch/ }),
    );
    const cells = screen.getAllByRole('checkbox', {
      name: /qc.manual.selectCell/,
    });
    expect(cells).toHaveLength(2);
    for (const cell of cells) await user.click(cell);
    await user.click(screen.getByRole('button', { name: 'qc.manual.update' }));
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'quality/projects/10/manual-states',
          method: 'POST',
          json: {
            items: [
              { checkId: 20, objectId: 12 },
              { checkId: 14, objectId: 12 },
              { checkId: 20, objectId: 13 },
            ],
            status: 'reviewed',
          },
        }),
      ),
    );
  });
  it('shows how many runs a to-do has failed in and the result of each run', async () => {
    const item = {
      id: 80,
      source: 'run',
      runId: 81,
      resultId: 82,
      lastRunId: 83,
      lastResultId: 84,
      occurrences: 2,
      checkId: 14,
      objectId: 12,
      kind: 'pr_review',
      title: '充值消费 · 饭卡',
      assigneeId: 'u1',
      prUrl: 'https://github.com/o/r/pull/9',
      prState: 'open',
      status: 'open',
      createdAt: '2026-10-05T10:00:00Z',
      runKey: '2026-10-06-01',
    };
    const history = [
      {
        id: 84,
        runId: 83,
        runKey: '2026-10-06-01',
        startedAt: '2026-10-06T10:00:00Z',
        conclusion: 'failed',
        note: '换一种改法：补充示例',
        prUrl: null,
      },
      {
        id: 82,
        runId: 81,
        runKey: '2026-10-05-01',
        startedAt: '2026-10-05T10:00:00Z',
        conclusion: 'failed',
        note: '缺少对账说明',
        prUrl: 'https://github.com/o/r/pull/9',
      },
    ];
    api.request.mockImplementation(async ({ path }: { path: string }) => ({
      data:
        path === 'quality/projects'
          ? [detail.project]
          : path === 'quality/users'
            ? [{ id: 'u1', name: '测试负责人' }]
            : path.endsWith('/work-items/80')
              ? { item, result: null, run: null, history }
              : path.includes('/work-items')
                ? [item]
                : path.endsWith('/runs')
                  ? []
                  : structuredClone(detail),
    }));
    const user = userEvent.setup();
    show('todo');
    expect(await screen.findByText('qc.occurrences')).toBeVisible();
    await user.click(screen.getByText('充值消费 · 饭卡'));
    expect(await screen.findByText('qc.runHistory')).toBeVisible();
    expect(screen.getByText('换一种改法：补充示例')).toBeVisible();
    expect(screen.getByText('2026-10-05-01')).toBeVisible();
  });
});
