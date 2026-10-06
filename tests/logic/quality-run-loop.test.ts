// @vitest-environment node

import {
  authenticationToken,
  userAdministrationServiceToken,
  type Auth,
  type UserAdministrationService,
} from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Context } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import routes from '../../server/routes/index.js';

type Row = Record<string, unknown> & { id: number };
type Filter = Record<string, unknown>;

/** An in-memory stand-in for the repositories the quality routes use, with equality filters only. */
function createMemoryDatabase(seed: Record<string, Row[]>) {
  const tables = new Map<string, Row[]>(
    Object.entries(seed).map(([name, rows]) => [
      name,
      rows.map((row) => ({ ...row })),
    ]),
  );
  const rowsOf = (name: string) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  };
  const matches = (row: Row, filter: Filter = {}) =>
    Object.entries(filter).every(([key, value]) => row[key] === value);
  const repository = (name: string) => ({
    findMany: async (options?: { filter?: Filter }) =>
      rowsOf(name)
        .filter((row) => matches(row, options?.filter))
        .map((row) => structuredClone(row)),
    findOne: async (options: { filter?: Filter }) => {
      const row = rowsOf(name).find((r) => matches(r, options.filter));
      return row && structuredClone(row);
    },
    exists: async (options: { filter?: Filter }) =>
      rowsOf(name).some((r) => matches(r, options.filter)),
    count: async (options: { filter?: Filter }) =>
      rowsOf(name).filter((r) => matches(r, options.filter)).length,
    createOne: async (options: { values: Record<string, unknown> }) => {
      const rows = rowsOf(name);
      const record = {
        id: Math.max(0, ...rows.map((r) => r.id)) + 1,
        ...structuredClone(options.values),
      } as Row;
      rows.push(record);
      return { record: structuredClone(record) };
    },
    updateOne: async (options: {
      filter: Filter;
      values: Record<string, unknown>;
    }) => {
      const row = rowsOf(name).find((r) => matches(r, options.filter));
      if (!row) throw new Error('No row to update in ' + name);
      Object.assign(row, structuredClone(options.values));
      return { record: structuredClone(row) };
    },
  });
  const manager = {
    repository,
    transaction: async <T>(fn: (conn: unknown) => Promise<T>) =>
      fn({ repository }),
  };
  return { manager: manager as unknown as DatabaseManager, tables };
}

function createFakeAuth(): Auth {
  const required =
    () => async (context: Context, next: () => Promise<void>) => {
      const user = context.req.header('x-test-user');
      if (user === undefined)
        return context.json({ error: { code: 'UNAUTHORIZED' } }, 401);
      context.set('auth', { user: { id: user }, session: {} });
      await next();
    };
  return { required, optional: required } as unknown as Auth;
}

function createFakeAuthorization() {
  return {
    middleware: () => async (context: Context, next: () => Promise<void>) => {
      const unrestricted = context.req.header('x-test-user') === 'root';
      context.set('authz', { snapshot: async () => ({ unrestricted }) });
      await next();
    },
  };
}

// Two objects share one dimension; object 3 is paused and object 2 turned the shared Check off.
function seed(): Record<string, Row[]> {
  return {
    qcProjects: [{ id: 1, key: 'p1', name: 'P', type: 'custom', active: true }],
    qcDimensions: [
      { id: 1, projectId: 1, key: 'd1', name: 'D', position: 0, active: true },
    ],
    qcObjects: [1, 2, 3].map((id) => ({
      id,
      projectId: 1,
      key: 'o' + id,
      name: 'Object ' + id,
      category: 'feature',
      description: '',
      active: true,
      testingPaused: id === 3,
      pausedReason: null,
      materials: null,
    })),
    qcApplicability: [1, 2, 3].map((id) => ({
      id,
      projectId: 1,
      objectId: id,
      dimensionId: 1,
    })),
    qcChecks: [
      {
        id: 1,
        projectId: 1,
        scope: 'shared',
        objectId: null,
        dimensionId: 1,
        key: 'c1',
        name: 'Shared',
        active: true,
        fixMode: 'assign',
        assigneeId: 'owner',
        source: null,
      },
      {
        id: 2,
        projectId: 1,
        scope: 'object',
        objectId: 1,
        dimensionId: 1,
        key: 'c2',
        name: 'Reviewed',
        active: true,
        fixMode: 'assign',
        assigneeId: null,
        source: null,
      },
    ],
    qcStandards: [
      { id: 1, checkId: 1, version: 1, published: true, humanReview: false },
      { id: 2, checkId: 1, version: 2, published: true, humanReview: false },
      { id: 3, checkId: 2, version: 1, published: true, humanReview: true },
    ],
    qcCheckExclusions: [{ id: 1, projectId: 1, checkId: 1, objectId: 2 }],
    qcRuns: [],
    qcResults: [],
    qcWorkItems: [],
  };
}

async function setup(nocoproject?: Record<string, unknown>) {
  const database = createMemoryDatabase(seed());
  const sent: unknown[] = [];
  const container = new ServiceContainer();
  container.instance(authenticationToken, createFakeAuth());
  container.instance(authorizationToken, createFakeAuthorization() as never);
  container.instance(databaseManagerToken, database.manager);
  container.instance(
    userAdministrationServiceToken,
    {} as UserAdministrationService,
  );
  container.instance(notificationServiceToken, {
    send: async (message: unknown) => {
      sent.push(message);
    },
  } as never);
  const config: Record<string, unknown> = {
    nocoproject: { deadlineHours: 12, ...nocoproject },
    app: { publicBasePath: '/main' },
  };
  const router = await routes[0]!.createRouter({
    container,
    config: { get: (key: string) => config[key] },
  } as unknown as Application);
  const request = (
    method: string,
    path: string,
    body?: unknown,
    user = 'root',
  ) =>
    router.request('http://quality.test/quality' + path, {
      method,
      headers: {
        ...(user ? { 'x-test-user': user } : {}),
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { request, tables: database.tables, sent };
}

const report = (checkId: number, objectId: number, conclusion: string) => ({
  checkId,
  objectId,
  conclusion,
  evidence: 'evidence for ' + checkId + '×' + objectId,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('starting and filling a run', () => {
  it('rejects anonymous and restricted callers', async () => {
    const { request } = await setup();
    expect((await request('POST', '/projects/1/runs', {}, '')).status).toBe(
      401,
    );
    expect(
      (await request('POST', '/projects/1/runs', {}, 'member')).status,
    ).toBe(403);
    expect(
      (
        await request(
          'POST',
          '/projects/1/runs/1/results',
          report(1, 1, 'passed'),
          'member',
        )
      ).status,
    ).toBe(403);
  });

  it('plans every enabled Check on included objects with its latest standard', async () => {
    const { request } = await setup();
    const response = await request('POST', '/projects/1/runs', {});
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as {
      data: {
        key: string;
        status: string;
        plan: unknown[];
        displayStatus: string;
      };
    };
    expect(data.status).toBe('running');
    expect(data.displayStatus).toBe('running');
    expect(data.key).toMatch(/^\d{4}-\d{2}-\d{2}-01$/);
    // Object 2 turned the shared Check off and object 3 is paused.
    expect(data.plan).toEqual([
      { checkId: 1, objectId: 1, standardId: 2 },
      { checkId: 2, objectId: 1, standardId: 3 },
    ]);
    expect((await request('POST', '/projects/1/runs', {})).status).toBe(409);
  });

  it('records results one at a time, keeps to-dos in step and refuses pairs outside the plan', async () => {
    const { request, tables } = await setup();
    await request('POST', '/projects/1/runs', {});
    const failed = await request('POST', '/projects/1/runs/1/results', {
      ...report(1, 1, 'failed'),
      environment: { code: { commit: 'abc' } },
    });
    expect(failed.status).toBe(200);
    expect(
      ((await failed.json()) as { data: { progress: unknown } }).data.progress,
    ).toEqual({
      done: 1,
      total: 2,
    });
    expect(tables.get('qcRuns')![0]!.environment).toEqual({
      code: { commit: 'abc' },
    });
    expect(tables.get('qcWorkItems')).toMatchObject([
      { kind: 'manual', status: 'open', assigneeId: 'owner', resultId: 1 },
    ]);
    // Reporting the same pair again replaces the result and closes its to-do once it passes.
    await request('POST', '/projects/1/runs/1/results', report(1, 1, 'passed'));
    expect(tables.get('qcResults')).toHaveLength(1);
    expect(tables.get('qcWorkItems')).toMatchObject([
      { status: 'done', doneBy: 'system' },
    ]);
    expect(
      (
        await request(
          'POST',
          '/projects/1/runs/1/results',
          report(1, 2, 'passed'),
        )
      ).status,
    ).toBe(400);
  });

  it('waits for a person when the standard requires review', async () => {
    const { request, tables } = await setup();
    await request('POST', '/projects/1/runs', {});
    await request('POST', '/projects/1/runs/1/results', report(2, 1, 'failed'));
    expect(tables.get('qcResults')).toMatchObject([
      { reviewStatus: 'pending', reportedConclusion: 'failed' },
    ]);
    expect(tables.get('qcWorkItems')).toMatchObject([
      { kind: 'review', status: 'open', assigneeId: 'root' },
    ]);
    const reviewed = await request(
      'POST',
      '/projects/1/runs/1/results/1/review',
      {
        conclusion: 'passed',
        note: 'The page has real content.',
      },
    );
    expect(reviewed.status).toBe(200);
    expect(tables.get('qcResults')).toMatchObject([
      { conclusion: 'passed', reviewStatus: 'confirmed', reviewedBy: 'root' },
    ]);
    expect(tables.get('qcWorkItems')).toMatchObject([{ status: 'done' }]);
  });

  it('finishes once, notifies assignees of open to-dos and then refuses more results', async () => {
    const { request, sent } = await setup();
    await request('POST', '/projects/1/runs', {});
    await request('POST', '/projects/1/runs/1/results', report(1, 1, 'failed'));
    const finished = await request('POST', '/projects/1/runs/1/finish', {});
    expect(finished.status).toBe(200);
    expect(
      ((await finished.json()) as { data: { status: string } }).data.status,
    ).toBe('completed');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ messages: { inbox: { to: 'owner' } } });
    expect(
      (await request('POST', '/projects/1/runs/1/finish', {})).status,
    ).toBe(200);
    expect(sent).toHaveLength(1);
    expect(
      (
        await request(
          'POST',
          '/projects/1/runs/1/results',
          report(1, 1, 'passed'),
        )
      ).status,
    ).toBe(409);
  });

  it('shows a running run past its deadline as not reported back', async () => {
    const { request, tables } = await setup();
    await request('POST', '/projects/1/runs', {});
    tables.get('qcRuns')![0]!.deadlineAt = '2000-01-01T00:00:00.000Z';
    const list = (await (await request('GET', '/projects/1/runs')).json()) as {
      data: { displayStatus: string; expected: number }[];
    };
    expect(list.data[0]).toMatchObject({
      displayStatus: 'overdue',
      expected: 2,
    });
    // An overdue run no longer blocks the next one.
    expect((await request('POST', '/projects/1/runs', {})).status).toBe(201);
  });
});

describe('one to-do per Check × object across runs', () => {
  // Runs the shared Check on object 1 once per call and returns the run id.
  async function runOnce(
    request: Awaited<ReturnType<typeof setup>>['request'],
    body: Record<string, unknown>,
  ) {
    const started = (await (
      await request('POST', '/projects/1/runs', {})
    ).json()) as { data: { id: number } };
    const runId = started.data.id;
    await request('POST', `/projects/1/runs/${runId}/results`, {
      ...report(1, 1, 'failed'),
      ...body,
    });
    await request('POST', `/projects/1/runs/${runId}/finish`, {});
    return runId;
  }

  it('updates the open to-do when a later run fails the same pair, keeping its PR', async () => {
    const { request, tables } = await setup();
    await runOnce(request, { prUrl: 'https://github.com/o/r/pull/1' });
    const second = await runOnce(request, { note: 'another way to fix it' });
    const items = tables.get('qcWorkItems')!;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'pr_review',
      prUrl: 'https://github.com/o/r/pull/1',
      occurrences: 2,
      lastRunId: second,
      runId: 1,
      status: 'open',
    });
    // The later run lists the to-do it continued.
    const detail = (await (
      await request('GET', `/projects/1/runs/${second}`)
    ).json()) as { data: { workItems: { id: number }[] } };
    expect(detail.data.workItems.map((i) => i.id)).toEqual([items[0]!.id]);
    // The to-do shows every result of its pair, newest first.
    const opened = (await (
      await request('GET', `/projects/1/work-items/${items[0]!.id}`)
    ).json()) as { data: { history: { runId: number; note: string }[] } };
    expect(opened.data.history.map((h) => h.runId)).toEqual([second, 1]);
  });

  it('leaves the to-do open when a later run passes, and opens a new one after it was marked done', async () => {
    const { request, tables } = await setup();
    await runOnce(request, {});
    await runOnce(request, { conclusion: 'passed' });
    expect(tables.get('qcWorkItems')).toMatchObject([
      { status: 'open', occurrences: 1 },
    ]);
    await request('POST', '/projects/1/work-items/complete', { ids: [1] });
    await runOnce(request, {});
    expect(
      tables.get('qcWorkItems')!.map((i) => [i.status, i.occurrences]),
    ).toEqual([
      ['done', 1],
      ['open', 1],
    ]);
  });
});

describe('dispatching a run to NocoProject', () => {
  it('creates one task with the run link and keeps a failure for retry', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({ data: { id: 77, identifier: 'NP-77' } }),
          {
            status: 201,
          },
        );
      }),
    );
    const { request } = await setup({
      url: 'https://np.test/main/',
      apiKey: 'secret',
      projectId: 'np1',
      agentId: 'agent1',
    });
    const started = (await (
      await request('POST', '/projects/1/runs', {})
    ).json()) as {
      data: { externalTaskId: string; externalTaskKey: string };
    };
    expect(started.data).toMatchObject({
      externalTaskId: '77',
      externalTaskKey: 'NP-77',
    });
    expect(calls[0]!.url).toBe('https://np.test/main/api/np/issues');
    expect(calls[0]!.init.headers).toMatchObject({ 'x-api-key': 'secret' });
    const body = JSON.parse(String(calls[0]!.init.body)) as {
      executor: unknown;
      description: string;
    };
    expect(body.executor).toEqual({ type: 'agent', id: 'agent1' });
    expect(body.description).toContain(
      'http://quality.test/main/quality?project=1&view=run&record=1',
    );
    expect(
      (await request('POST', '/projects/1/runs/1/dispatch', {})).status,
    ).toBe(409);
  });

  it('starts the run even when NocoProject cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED');
      }),
    );
    const { request } = await setup({
      url: 'https://np.test/main',
      apiKey: 'secret',
      projectId: 'np1',
    });
    const response = await request('POST', '/projects/1/runs', {});
    expect(response.status).toBe(201);
    expect(
      ((await response.json()) as { data: { dispatchError: string } }).data
        .dispatchError,
    ).toContain('ECONNREFUSED');
  });
});

describe('editing and restoring definitions', () => {
  it('requires a command for a script-judged Check', async () => {
    const { request } = await setup();
    const base = {
      name: 'Script',
      scope: 'shared',
      dimensionId: 1,
      definition: 'd',
      preconditions: 'p',
      steps: 's',
      passCriteria: 'c',
      evidence: 'e',
      humanReview: false,
      judgeMode: 'script',
    };
    expect((await request('POST', '/projects/1/checks', base)).status).toBe(
      400,
    );
    expect(
      (
        await request('POST', '/projects/1/checks', {
          ...base,
          command: 'node check.mjs',
        })
      ).status,
    ).toBe(201);
  });

  it('renames objects with materials and restores archived ones', async () => {
    const { request, tables } = await setup();
    const updated = await request('POST', '/projects/1/objects/1/update', {
      name: 'Database',
      category: 'build',
      description: 'Collections and migrations',
      materials: [{ type: 'skill', ref: 'nocobase-db' }],
    });
    expect(updated.status).toBe(200);
    expect(tables.get('qcObjects')![0]).toMatchObject({
      name: 'Database',
      materials: [{ type: 'skill', ref: 'nocobase-db' }],
    });
    await request('POST', '/projects/1/objects/1/archive', {});
    const archived = (await (
      await request('GET', '/projects/1/archived')
    ).json()) as {
      data: { objects: { id: number }[]; checks: { id: number }[] };
    };
    expect(archived.data.objects.map((o) => o.id)).toEqual([1]);
    // The object Check went with its object and comes back only after the object.
    expect(archived.data.checks.map((c) => c.id)).toEqual([2]);
    expect(
      (await request('POST', '/projects/1/checks/2/restore', {})).status,
    ).toBe(409);
    expect(
      (await request('POST', '/projects/1/objects/1/restore', {})).status,
    ).toBe(200);
    expect(
      (await request('POST', '/projects/1/checks/2/restore', {})).status,
    ).toBe(200);
  });
});
