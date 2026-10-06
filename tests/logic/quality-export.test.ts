// @vitest-environment node

import {
  authenticationToken,
  userAdministrationServiceToken,
  type Auth,
  type UserAdministrationService,
} from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import routes from '../../server/routes/index.js';
import { exportCollections } from '../../server/quality/export.js';

type Row = Record<string, unknown> & { id: number };

/** Holds rows per collection and answers the reads the export makes. */
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
  const matches = (row: Row, filter: Record<string, unknown> = {}) =>
    Object.entries(filter).every(([key, value]) => row[key] === value);
  const repository = (name: string) => ({
    findMany: async (options?: { filter?: Record<string, unknown> }) =>
      rowsOf(name)
        .filter((row) => matches(row, options?.filter))
        .map((row) => ({ ...row })),
    findOne: async (options: { filter?: Record<string, unknown> }) => {
      const row = rowsOf(name).find((r) => matches(r, options.filter));
      return row && { ...row };
    },
  });
  const query = () => ({
    selectFrom: () => {
      const chain = {
        select: () => chain,
        orderBy: () => chain,
        execute: async () => [
          { name: '202609290001_quality_center', package_name: 'app' },
        ],
      };
      return chain;
    },
  });
  const manager = { repository, query };
  return { manager: manager as unknown as DatabaseManager, tables };
}

/** Stands in for the authentication plugin: a header decides the session. */
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

/** Only the user named root holds the unrestricted permission snapshot; `quality-member` holds the quality page grant. */
function createFakeAuthorization() {
  return {
    middleware: () => async (context: Context, next: () => Promise<void>) => {
      const user = context.req.header('x-test-user');
      const unrestricted = user === 'root';
      // `quality-member` holds the quality page grant and nothing else.
      context.set('authz', {
        snapshot: async () => ({ unrestricted }),
        can: async (request: {
          resource: { type: string; id: string };
          action: string;
        }) =>
          user === 'quality-member' &&
          request.resource.type === 'page' &&
          request.resource.id === 'quality' &&
          request.action === 'access',
      });
      await next();
    },
  };
}

const users = {
  list: async ({ page = 1 }: { page?: number } = {}) => ({
    items:
      page === 1
        ? [
            {
              id: 'root',
              name: 'Root',
              username: 'nocobase',
              email: 'admin@nocobase.com',
              disabledAt: null,
            },
            {
              id: 'u2',
              name: 'Former',
              email: 'former@nocobase.com',
              disabledAt: new Date(),
            },
          ]
        : [],
    total: 2,
    page,
    pageSize: 100,
  }),
} as unknown as UserAdministrationService;

function seed(): Record<string, Row[]> {
  return {
    qcProjects: [
      { id: 1, key: 'p1', name: 'P', type: 'custom', active: true },
      { id: 2, key: 'p2', name: 'Old', type: 'custom', active: false },
    ],
    qcDimensions: [
      { id: 1, projectId: 1, key: 'd1', name: 'D', position: 0, active: true },
      { id: 2, projectId: 1, key: 'd2', name: 'X', position: 1, active: false },
    ],
    qcObjects: [
      {
        id: 1,
        projectId: 1,
        key: 'o1',
        name: 'Kept',
        category: 'feature',
        description: '',
        active: true,
        testingPaused: false,
        pausedReason: null,
        sourceSnapshot: { source: 'tm3', sourceId: 5 },
      },
      {
        id: 2,
        projectId: 1,
        key: 'o2',
        name: 'Gone',
        category: 'feature',
        description: 'archived earlier',
        active: false,
        testingPaused: false,
        pausedReason: null,
      },
    ],
    qcApplicability: [
      { id: 1, projectId: 1, objectId: 1, dimensionId: 1 },
      { id: 2, projectId: 1, objectId: 2, dimensionId: 1 },
    ],
    qcChecks: [
      {
        id: 1,
        projectId: 1,
        scope: 'object',
        objectId: 1,
        dimensionId: 1,
        key: 'c1',
        name: 'Own',
        active: true,
      },
      {
        id: 2,
        projectId: 1,
        scope: 'shared',
        objectId: null,
        dimensionId: 1,
        key: 'c2',
        name: 'Shared',
        active: true,
      },
      {
        id: 3,
        projectId: 1,
        scope: 'object',
        objectId: 1,
        dimensionId: 1,
        key: 'c3',
        name: 'Archived',
        active: false,
      },
    ],
    qcStandards: [
      { id: 1, checkId: 1, version: 1, published: true },
      { id: 2, checkId: 1, version: 2, published: true },
      { id: 3, checkId: 2, version: 1, published: true },
      { id: 4, checkId: 3, version: 1, published: true },
    ],
    qcCheckExclusions: [
      { id: 1, projectId: 1, checkId: 2, objectId: 1, reason: null },
    ],
    qcTasks: [
      { id: 1, projectId: 1, checkId: 1, objectId: 1, standardId: 1 },
      { id: 2, projectId: 1, checkId: 2, objectId: 1, standardId: 3 },
    ],
    qcRuns: [{ id: 1, projectId: 1, key: '2026-09-30-01', status: 'done' }],
    qcResults: [
      {
        id: 1,
        projectId: 1,
        runId: 1,
        checkId: 1,
        objectId: 1,
        conclusion: 'failed',
      },
    ],
    qcWorkItems: [
      {
        id: 1,
        projectId: 1,
        runId: 1,
        resultId: 1,
        objectId: 1,
        assigneeId: 'u2',
        status: 'open',
      },
    ],
    qcManualStates: [
      {
        id: 1,
        projectId: 1,
        checkId: 1,
        objectId: 1,
        status: 'reviewed',
        note: null,
        createdBy: 'u2',
        createdAt: '2026-10-06T00:00:00.000Z',
      },
    ],
  };
}

async function setup() {
  const database = createMemoryDatabase(seed());
  const container = new ServiceContainer();
  container.instance(authenticationToken, createFakeAuth());
  container.instance(authorizationToken, createFakeAuthorization() as never);
  container.instance(databaseManagerToken, database.manager);
  container.instance(userAdministrationServiceToken, users);
  const router = await routes[0]!.createRouter({
    container,
  } as unknown as Application);
  const request = (path: string, user?: string) =>
    router.request(`/quality${path}`, {
      headers: user ? { 'x-test-user': user } : {},
    });
  return { request };
}

describe('GET /quality/export', () => {
  it('rejects anonymous and restricted callers', async () => {
    const { request } = await setup();

    const anonymous = await request('/export');
    expect(anonymous.status).toBe(401);

    const member = await request('/export', 'member');
    expect(member.status).toBe(403);
    await expect(member.json()).resolves.toEqual({
      error: { code: 'FORBIDDEN' },
    });
  });

  it('keeps the backup from members who may use the quality workspace', async () => {
    const { request } = await setup();

    const qualityMember = await request('/export', 'quality-member');
    expect(qualityMember.status).toBe(403);
    await expect(qualityMember.json()).resolves.toEqual({
      error: { code: 'FORBIDDEN' },
    });
  });

  it('exports every quality table with archived rows, original ids and user names', async () => {
    const { request } = await setup();

    const response = await request('/export', 'root');

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(Object.keys(data.tables)).toEqual([...exportCollections]);
    expect(data.exportedAt).toEqual(expect.any(String));
    expect(data.schema.migrations).toEqual([
      { name: '202609290001_quality_center', package: 'app' },
    ]);
    const all = seed();
    for (const collection of exportCollections)
      expect(data.tables[collection]).toEqual(all[collection]);
    expect(data.counts.qcChecks).toBe(3);
    // Archived project, dimension, object and Check keep their ids and inactive state.
    expect(data.tables.qcProjects[1]).toMatchObject({ id: 2, active: false });
    expect(data.tables.qcDimensions[1]).toMatchObject({ id: 2, active: false });
    expect(data.tables.qcObjects[1]).toMatchObject({ id: 2, active: false });
    expect(data.tables.qcChecks[2]).toMatchObject({ id: 3, active: false });
    expect(data.tables.qcObjects[0].sourceSnapshot).toEqual({
      source: 'tm3',
      sourceId: 5,
    });
    expect(data.users).toEqual([
      {
        id: 'root',
        name: 'Root',
        username: 'nocobase',
        email: 'admin@nocobase.com',
        disabled: false,
      },
      {
        id: 'u2',
        name: 'Former',
        username: null,
        email: 'former@nocobase.com',
        disabled: true,
      },
    ]);
    expect(JSON.stringify(data)).not.toMatch(/password|session|apiKey/i);
  });
});
