import { importRun, runImportSchema } from '../quality/runs.js';
import {
  displayStatus,
  finishRun,
  recordResult,
  resultReportSchema,
  runFinishSchema,
  startRun,
} from '../quality/run-loop.js';
import {
  listManualStates,
  manualStateHistory,
  manualStateSchema,
  setManualStates,
} from '../quality/manual-states.js';
import {
  createNocoProjectTask,
  nocoProjectConfigured,
  runTaskRequest,
} from '../quality/nocoproject.js';
import type { NocoProjectConfig } from '../config/nocoproject.js';
import type { AppIdentityConfig } from '@nocobase/app-server/config';
import { exportQualityData } from '../quality/export.js';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import type { Application } from '@nocobase/app-server/application';
import { randomUUID } from 'node:crypto';
import {
  authenticationToken,
  userAdministrationServiceToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type {
  Project,
  Dimension,
  TestObject,
  Check,
  Standard,
  Applicability,
  CheckExclusion,
  Result,
  Run,
  WorkItem,
} from '../quality/types.js';

const name = z.string().trim().min(1).max(120);
const text = z.string().trim().min(1).max(10000);
const id = z.coerce.number().int().positive();
const standardSchema = z
  .object({
    definition: text,
    preconditions: text,
    // A human-judged Check is not run, so it needs no steps.
    steps: z.string().trim().max(10000),
    passCriteria: text,
    evidence: text,
    judgeMode: z.enum(['script', 'agent', 'session', 'human']).default('agent'),
    command: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
// An automated Check says how it runs, and a script-judged one which script decides it. A human-judged Check keeps
// no script.
function assertJudge(standard: {
  judgeMode: string;
  steps: string;
  command?: string | null;
}) {
  if (standard.judgeMode === 'human') {
    standard.command = null;
    return;
  }
  if (!standard.steps)
    throw new HTTPException(400, { message: 'STEPS_REQUIRED' });
  if (standard.judgeMode === 'script' && !standard.command)
    throw new HTTPException(400, { message: 'COMMAND_REQUIRED' });
}
const materialsSchema = z
  .array(
    z
      .object({
        type: z.enum(['skill', 'package', 'doc', 'other']),
        ref: z.string().trim().min(1).max(500),
      })
      .strict(),
  )
  .max(50);
const projectSchema = z
  .object({
    name,
    description: z.string().trim().max(1000),
    dimensionName: name,
  })
  .strict();
const objectSchema = z
  .object({
    name,
    category: z.enum([
      'feature',
      'build',
      'upgrade',
      'business',
      'installation',
      'deployment',
      'testing',
    ]),
    description: z.string().trim().max(10000).default(''),
    dimensionIds: z.array(id).min(1).max(50),
    materials: materialsSchema.optional(),
  })
  .strict();
const objectUpdateSchema = z
  .object({
    name,
    category: objectSchema.shape.category,
    description: z.string().trim().max(10000),
    materials: materialsSchema,
  })
  .strict();
const checkUpdateSchema = z
  .object({
    name,
    source: z.string().trim().max(10000).nullable(),
  })
  .strict();
const dimensionSchema = z
  .object({ name, objectIds: z.array(id).max(500) })
  .strict();
const checkSchema = z
  .object({
    name,
    scope: z.enum(['object', 'shared']).default('object'),
    fixMode: z.enum(['pr', 'assign']).default('assign'),
    assigneeId: z.string().min(1).max(64).nullable().optional(),
    objectId: id.optional(),
    dimensionId: id,
    source: z.string().trim().max(10000).nullable().optional(),
    ...standardSchema.shape,
  })
  .strict()
  .refine((v) => (v.scope === 'shared') === (v.objectId === undefined));

// The page id of the quality workspace route in `client/routes.ts`; permission sets store grants against it.
const QUALITY_PAGE = 'quality';

export default [
  defineApiRoutes<Application>((app) => {
    const root = new Hono();
    const router = new Hono<{
      Variables: AuthorizationEnv['Variables'] & AuthEnv['Variables'];
    }>();
    const userId = (c: {
      get: (key: 'auth') => AuthEnv['Variables']['auth'];
    }) => c.get('auth')?.user.id ?? '';
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const db = app.container.resolve(databaseManagerToken);
    const nocoProjectConfig = () =>
      app.config?.get<NocoProjectConfig>('nocoproject');
    // The run page in NocoQuality, for the NocoProject task. The public origin comes from configuration,
    // or from the request when none is configured.
    const runLink = (requestUrl: string, projectId: number, runId: number) => {
      const identity = app.config?.get<AppIdentityConfig>('app');
      const url = new URL(requestUrl);
      const base = (identity?.publicOrigin || url.origin).replace(/\/+$/, '');
      const path = (identity?.publicBasePath || '').replace(/\/+$/, '');
      return (
        base +
        path +
        '/quality?project=' +
        projectId +
        '&view=run&record=' +
        runId
      );
    };
    router.use('*', auth.required(), authz.middleware());
    // The quality workspace is open to root and to every permission set granted the `quality` page; the API checks
    // the same grant as the page, so hiding the menu is never the only barrier.
    router.use('*', async (c, next) => {
      const context = c.get('authz');
      if (
        !(await context.snapshot()).unrestricted &&
        !(await context.can({
          resource: { type: 'page', id: QUALITY_PAGE },
          action: 'access',
        }))
      )
        return c.json({ error: { code: 'FORBIDDEN' } }, 403);
      await next();
    });
    router.onError((error, c) => {
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return c.json({ error: { code: 'INVALID_INPUT' } }, 400);
      if (error instanceof HTTPException)
        return c.json({ error: { code: error.message } }, error.status);
      if (
        error instanceof Error &&
        /unique|duplicate|conflict/i.test(error.message)
      )
        return c.json({ error: { code: 'CONFLICT' } }, 409);
      console.error('Quality request failed', error);
      return c.json({ error: { code: 'REQUEST_FAILED' } }, 500);
    });
    // Full backup of every quality table, archived records included; the only copy of the data lives online.
    // The backup carries every account and record, so it stays with root even for quality members.
    router.get('/export', async (c) => {
      if (!(await c.get('authz').snapshot()).unrestricted)
        return c.json({ error: { code: 'FORBIDDEN' } }, 403);
      return c.json({
        data: await exportQualityData(
          db,
          app.container.resolve(userAdministrationServiceToken),
        ),
      });
    });
    router.get('/projects', async (c) =>
      c.json({
        data: await db
          .repository<Project>('qcProjects')
          .findMany({ filter: { active: true } }),
      }),
    );
    router.post('/projects', async (c) => {
      const input = projectSchema.parse(await c.req.json());
      const project = await db.transaction(async (conn) => {
        const result = await conn.repository<Project>('qcProjects').createOne({
          values: {
            key: randomUUID(),
            name: input.name,
            description: input.description,
            type: 'custom',
            active: true,
          },
        });
        await conn.repository<Dimension>('qcDimensions').createOne({
          values: {
            projectId: result.record.id,
            key: randomUUID(),
            name: input.dimensionName,
            position: 0,
            active: true,
          },
        });
        return result.record;
      });
      return c.json({ data: project }, 201);
    });
    router.use('/projects/:id/*', async (c, next) => {
      const projectId = id.parse(c.req.param('id'));
      if (
        !(await db
          .repository<Project>('qcProjects')
          .exists({ filter: { id: projectId, active: true } }))
      )
        throw new HTTPException(404, { message: 'PROJECT_NOT_FOUND' });
      await next();
    });
    router.get('/projects/:id', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const project = await db
        .repository<Project>('qcProjects')
        .findOne({ filter: { id: projectId, active: true } });
      if (!project)
        throw new HTTPException(404, { message: 'PROJECT_NOT_FOUND' });
      const dimensions = await db
        .repository<Dimension>('qcDimensions')
        .findMany({ filter: { projectId, active: true } });
      const objects = await db
        .repository<TestObject>('qcObjects')
        .findMany({ filter: { projectId, active: true } });
      const checks = await db
        .repository<Check>('qcChecks')
        .findMany({ filter: { projectId, active: true } });
      const standards: Standard[] = [];
      for (const check of checks)
        standards.push(
          ...(await db
            .repository<Standard>('qcStandards')
            .findMany({ filter: { checkId: check.id } })),
        );
      const activeCheckIds = new Set(checks.map((check) => check.id));
      // Applicability of archived objects stays stored but leaves the workspace with its object.
      const activeObjectIds = new Set(objects.map((object) => object.id));
      const applicability = (
        await db
          .repository<Applicability>('qcApplicability')
          .findMany({ filter: { projectId } })
      ).filter((row) => activeObjectIds.has(row.objectId));
      const exclusions = (
        await db
          .repository<CheckExclusion>('qcCheckExclusions')
          .findMany({ filter: { projectId } })
      ).filter((row) => activeCheckIds.has(row.checkId));
      // The current state of each human-judged Check × object; a pair without one is unreviewed.
      const manualStates = (await listManualStates(db, projectId)).filter(
        (row) =>
          activeCheckIds.has(row.checkId) && activeObjectIds.has(row.objectId),
      );
      return c.json({
        data: {
          exclusions,
          manualStates,
          project,
          // TM3 is a separate system; its imported snapshot stays stored but is no longer part of the workspace.
          objects: objects.map(
            ({ sourceSnapshot: _snapshot, ...object }) => object,
          ),
          dimensions: dimensions.sort((a, b) => a.position - b.position),
          checks,
          standards,
          applicability,
        },
      });
    });
    router.post('/projects/:id/objects', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const input = objectSchema.parse(await c.req.json());
      const result = await db.transaction(async (conn) => {
        for (const dimensionId of input.dimensionIds)
          if (
            !(await conn
              .repository<Dimension>('qcDimensions')
              .exists({ filter: { id: dimensionId, projectId, active: true } }))
          )
            throw new HTTPException(400, { message: 'INVALID_DIMENSION' });
        const object = (
          await conn.repository<TestObject>('qcObjects').createOne({
            values: {
              projectId,
              key: randomUUID(),
              name: input.name,
              category: input.category,
              description: input.description,
              materials: input.materials ?? null,
              active: true,
            },
          })
        ).record;
        for (const dimensionId of new Set(input.dimensionIds))
          await conn.repository<Applicability>('qcApplicability').createOne({
            values: { projectId, objectId: object.id, dimensionId },
          });
        return object;
      });
      return c.json({ data: result }, 201);
    });
    // Removing an object archives it together with its object Checks; standards, results and evidence remain for audit.
    router.post('/projects/:id/objects/:objectId/archive', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const objectId = id.parse(c.req.param('objectId'));
      await db.transaction(async (conn) => {
        const repo = conn.repository<TestObject>('qcObjects');
        if (
          !(await repo.exists({
            filter: { id: objectId, projectId, active: true },
          }))
        )
          throw new HTTPException(404, { message: 'OBJECT_NOT_FOUND' });
        await repo.updateOne({
          filter: { id: objectId, projectId },
          values: { active: false },
        });
        const checks = await conn.repository<Check>('qcChecks').findMany({
          filter: { projectId, objectId, scope: 'object', active: true },
        });
        for (const check of checks)
          await conn.repository<Check>('qcChecks').updateOne({
            filter: { id: check.id, projectId },
            values: { active: false },
          });
      });
      return c.json({ data: { id: objectId, active: false } });
    });
    // Includes or pauses a whole group of objects at once, all or nothing.
    router.post('/projects/:id/objects/testing', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const input = z
        .object({
          objectIds: z.array(id).min(1).max(500),
          enabled: z.boolean(),
        })
        .strict()
        .parse(await c.req.json());
      const objectIds = [...new Set(input.objectIds)];
      await db.transaction(async (conn) => {
        const repo = conn.repository<TestObject>('qcObjects');
        for (const objectId of objectIds)
          if (
            !(await repo.exists({
              filter: { id: objectId, projectId, active: true },
            }))
          )
            throw new HTTPException(400, { message: 'INVALID_OBJECT' });
        for (const objectId of objectIds)
          await repo.updateOne({
            filter: { id: objectId, projectId },
            values: {
              testingPaused: !input.enabled,
              ...(input.enabled ? { pausedReason: null } : {}),
            },
          });
      });
      return c.json({
        data: { objectIds, testingPaused: !input.enabled },
      });
    });
    router.post('/projects/:id/objects/:objectId/testing', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const objectId = id.parse(c.req.param('objectId'));
      const input = z
        .object({
          enabled: z.boolean(),
          reason: z.string().trim().max(500).optional(),
        })
        .strict()
        .parse(await c.req.json());
      const repo = db.repository<TestObject>('qcObjects');
      if (
        !(await repo.exists({
          filter: { id: objectId, projectId, active: true },
        }))
      )
        throw new HTTPException(404, { message: 'OBJECT_NOT_FOUND' });
      await repo.updateOne({
        filter: { id: objectId, projectId },
        values: {
          testingPaused: !input.enabled,
          pausedReason: input.enabled ? null : input.reason || null,
        },
      });
      return c.json({ data: { id: objectId, testingPaused: !input.enabled } });
    });
    // Names, descriptions and materials change in place; applicability and history stay as they are.
    router.post('/projects/:id/objects/:objectId/update', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const objectId = id.parse(c.req.param('objectId'));
      const input = objectUpdateSchema.parse(await c.req.json());
      const repo = db.repository<TestObject>('qcObjects');
      if (
        !(await repo.exists({
          filter: { id: objectId, projectId, active: true },
        }))
      )
        throw new HTTPException(404, { message: 'OBJECT_NOT_FOUND' });
      return c.json({
        data: (
          await repo.updateOne({
            filter: { id: objectId, projectId },
            values: input,
          })
        ).record,
      });
    });
    // Archived objects and Checks, so a removal can be undone.
    router.get('/projects/:id/archived', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      return c.json({
        data: {
          objects: await db
            .repository<TestObject>('qcObjects')
            .findMany({ filter: { projectId, active: false } }),
          checks: await db
            .repository<Check>('qcChecks')
            .findMany({ filter: { projectId, active: false } }),
        },
      });
    });
    // Restoring an object brings back only the object; its archived Checks are restored one by one.
    router.post('/projects/:id/objects/:objectId/restore', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const objectId = id.parse(c.req.param('objectId'));
      const repo = db.repository<TestObject>('qcObjects');
      if (
        !(await repo.exists({
          filter: { id: objectId, projectId, active: false },
        }))
      )
        throw new HTTPException(404, { message: 'OBJECT_NOT_FOUND' });
      await repo.updateOne({
        filter: { id: objectId, projectId },
        values: { active: true },
      });
      return c.json({ data: { id: objectId, active: true } });
    });
    router.post('/projects/:id/dimensions', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const input = dimensionSchema.parse(await c.req.json());
      const result = await db.transaction(async (conn) => {
        for (const objectId of input.objectIds)
          if (
            !(await conn
              .repository<TestObject>('qcObjects')
              .exists({ filter: { id: objectId, projectId, active: true } }))
          )
            throw new HTTPException(400, { message: 'INVALID_OBJECT' });
        const dimension = (
          await conn.repository<Dimension>('qcDimensions').createOne({
            values: {
              projectId,
              key: randomUUID(),
              name: input.name,
              position: await conn
                .repository<Dimension>('qcDimensions')
                .count({ filter: { projectId } }),
              active: true,
            },
          })
        ).record;
        for (const objectId of new Set(input.objectIds))
          await conn.repository<Applicability>('qcApplicability').createOne({
            values: { projectId, objectId, dimensionId: dimension.id },
          });
        return dimension;
      });
      return c.json({ data: result }, 201);
    });
    router.post('/projects/:id/checks', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const {
        name: checkName,
        scope,
        objectId,
        dimensionId,
        fixMode,
        assigneeId,
        source,
        ...standard
      } = checkSchema.parse(await c.req.json());
      assertJudge(standard);
      const result = await db.transaction(async (conn) => {
        if (
          scope === 'shared'
            ? !(await conn.repository<Dimension>('qcDimensions').exists({
                filter: { id: dimensionId, projectId, active: true },
              }))
            : !(await conn
                .repository<Applicability>('qcApplicability')
                .exists({ filter: { projectId, objectId, dimensionId } }))
        )
          throw new HTTPException(400, { message: 'INVALID_APPLICABILITY' });
        const check = (
          await conn.repository<Check>('qcChecks').createOne({
            values: {
              projectId,
              scope,
              fixMode,
              assigneeId: assigneeId ?? null,
              source: source || null,
              objectId: scope === 'shared' ? null : objectId,
              dimensionId,
              key: randomUUID(),
              name: checkName,
              active: true,
            },
          })
        ).record;
        await conn.repository<Standard>('qcStandards').createOne({
          values: {
            ...standard,
            checkId: check.id,
            version: 1,
            published: true,
          },
        });
        return check;
      });
      return c.json({ data: result }, 201);
    });
    // Removing a Check archives it: standards and task evidence remain for audit, the workspace no longer lists them.
    router.post('/projects/:id/checks/:checkId/archive', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const checkId = id.parse(c.req.param('checkId'));
      const repository = db.repository<Check>('qcChecks');
      if (
        !(await repository.exists({
          filter: { id: checkId, projectId, active: true },
        }))
      )
        throw new HTTPException(404, { message: 'CHECK_NOT_FOUND' });
      await repository.updateOne({
        filter: { id: checkId, projectId },
        values: { active: false },
      });
      return c.json({ data: { id: checkId, active: false } });
    });
    router.post('/projects/:id/checks/:checkId/update', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const checkId = id.parse(c.req.param('checkId'));
      const input = checkUpdateSchema.parse(await c.req.json());
      const repo = db.repository<Check>('qcChecks');
      if (
        !(await repo.exists({
          filter: { id: checkId, projectId, active: true },
        }))
      )
        throw new HTTPException(404, { message: 'CHECK_NOT_FOUND' });
      return c.json({
        data: (
          await repo.updateOne({
            filter: { id: checkId, projectId },
            values: { name: input.name, source: input.source || null },
          })
        ).record,
      });
    });
    // An object Check comes back only while its object is in the workspace.
    router.post('/projects/:id/checks/:checkId/restore', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const checkId = id.parse(c.req.param('checkId'));
      const repo = db.repository<Check>('qcChecks');
      const check = await repo.findOne({
        filter: { id: checkId, projectId, active: false },
      });
      if (!check) throw new HTTPException(404, { message: 'CHECK_NOT_FOUND' });
      if (
        check.scope === 'object' &&
        !(await db.repository<TestObject>('qcObjects').exists({
          filter: { id: check.objectId!, projectId, active: true },
        }))
      )
        throw new HTTPException(409, { message: 'OBJECT_ARCHIVED' });
      await repo.updateOne({
        filter: { id: checkId, projectId },
        values: { active: true },
      });
      return c.json({ data: { id: checkId, active: true } });
    });
    // Objects turn a shared Check off or back on; the Check itself stays shared by the rest of its dimension.
    router.post('/projects/:id/checks/:checkId/exclusions', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const checkId = id.parse(c.req.param('checkId'));
      const input = z
        .object({
          objectId: id,
          enabled: z.boolean(),
          reason: z.string().trim().max(500).optional(),
        })
        .strict()
        .parse(await c.req.json());
      const result = await db.transaction(async (conn) => {
        const check = await conn.repository<Check>('qcChecks').findOne({
          filter: { id: checkId, projectId, active: true, scope: 'shared' },
        });
        if (!check)
          throw new HTTPException(404, { message: 'CHECK_NOT_FOUND' });
        if (
          !(await conn.repository<Applicability>('qcApplicability').exists({
            filter: {
              projectId,
              objectId: input.objectId,
              dimensionId: check.dimensionId,
            },
          }))
        )
          throw new HTTPException(400, { message: 'INVALID_OBJECT' });
        const repo = conn.repository<CheckExclusion>('qcCheckExclusions');
        const filter = { checkId, objectId: input.objectId, projectId };
        const existing = await repo.findOne({ filter });
        if (input.enabled) {
          if (existing) await repo.deleteOne({ filter });
          return { checkId, objectId: input.objectId, enabled: true };
        }
        if (!existing)
          await repo.createOne({
            values: {
              ...filter,
              reason: input.reason || null,
              createdAt: new Date().toISOString(),
            },
          });
        return { checkId, objectId: input.objectId, enabled: false };
      });
      return c.json({ data: result });
    });
    router.post('/projects/:id/checks/:checkId/versions', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const checkId = id.parse(c.req.param('checkId'));
      // How a not-passed result is handled can change with the version that makes the Check automated.
      const { baseVersion, fixMode, ...standard } = standardSchema
        .extend({
          baseVersion: id,
          fixMode: z.enum(['pr', 'assign']).optional(),
        })
        .strict()
        .parse(await c.req.json());
      assertJudge(standard);
      const result = await db.transaction(async (conn) => {
        if (
          !(await conn
            .repository<Check>('qcChecks')
            .exists({ filter: { id: checkId, projectId, active: true } }))
        )
          throw new HTTPException(404, { message: 'CHECK_NOT_FOUND' });
        const versions = await conn
          .repository<Standard>('qcStandards')
          .findMany({ filter: { checkId } });
        const current = Math.max(...versions.map((v) => v.version));
        if (current !== baseVersion)
          throw new HTTPException(409, { message: 'STANDARD_CHANGED' });
        if (fixMode)
          await conn.repository<Check>('qcChecks').updateOne({
            filter: { id: checkId, projectId },
            values: { fixMode },
          });
        return (
          await conn.repository<Standard>('qcStandards').createOne({
            values: {
              ...standard,
              checkId,
              version: current + 1,
              published: true,
            },
          })
        ).record;
      });
      return c.json({ data: result }, 201);
    });
    // How a not-passed result of this Check is handled, and who reviews or handles it.
    router.post('/projects/:id/checks/:checkId/settings', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const checkId = id.parse(c.req.param('checkId'));
      const input = z
        .object({
          fixMode: z.enum(['pr', 'assign']),
          assigneeId: z.string().min(1).max(64).nullable(),
        })
        .strict()
        .parse(await c.req.json());
      const repo = db.repository<Check>('qcChecks');
      if (
        !(await repo.exists({
          filter: { id: checkId, projectId, active: true },
        }))
      )
        throw new HTTPException(404, { message: 'CHECK_NOT_FOUND' });
      await repo.updateOne({
        filter: { id: checkId, projectId },
        values: input,
      });
      return c.json({ data: { id: checkId, ...input } });
    });
    router.get('/users', async (c) => {
      const page = await app.container
        .resolve(userAdministrationServiceToken)
        .list({ pageSize: 200, status: 'enabled' });
      return c.json({
        data: page.items.map((u) => ({
          id: u.id,
          name: u.name || u.username || u.email,
        })),
      });
    });
    router.post('/projects/:id/runs/import', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const input = runImportSchema.parse(await c.req.json());
      const result = await importRun(
        db,
        app.container.resolve(notificationServiceToken),
        projectId,
        input,
        userId(c),
      );
      return c.json({ data: result }, 201);
    });
    router.get('/projects/:id/runs', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const runs = await db
        .repository<Run>('qcRuns')
        .findMany({ filter: { projectId } });
      const results = await db
        .repository<Result>('qcResults')
        .findMany({ filter: { projectId } });
      const items = await db
        .repository<WorkItem>('qcWorkItems')
        .findMany({ filter: { projectId } });
      return c.json({
        data: runs
          .sort((a, b) => b.key.localeCompare(a.key))
          .map(({ steps: _steps, scope: _scope, plan, ...run }) => ({
            ...run,
            displayStatus: displayStatus(run as Run),
            // A started run knows how many results it waits for; an imported one is complete as imported.
            expected:
              plan?.length ?? results.filter((r) => r.runId === run.id).length,
            passed: results.filter(
              (r) => r.runId === run.id && r.conclusion === 'passed',
            ).length,
            failed: results.filter(
              (r) => r.runId === run.id && r.conclusion === 'failed',
            ).length,
            // A to-do continued by a later run counts toward the run that last saw it.
            openItems: items.filter(
              (i) => (i.lastRunId ?? i.runId) === run.id && i.status === 'open',
            ).length,
            prs: items.filter(
              (i) => (i.lastRunId ?? i.runId) === run.id && i.prUrl,
            ).length,
          })),
      });
    });
    router.get('/projects/:id/runs/:runId', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const runId = id.parse(c.req.param('runId'));
      const run = await db
        .repository<Run>('qcRuns')
        .findOne({ filter: { id: runId, projectId } });
      if (!run) throw new HTTPException(404, { message: 'RUN_NOT_FOUND' });
      return c.json({
        data: {
          run: { ...run, displayStatus: displayStatus(run) },
          results: await db
            .repository<Result>('qcResults')
            .findMany({ filter: { runId } }),
          // To-dos raised by this run and those an earlier run raised that this run continued.
          workItems: [
            ...(await db
              .repository<WorkItem>('qcWorkItems')
              .findMany({ filter: { runId } })),
            ...(
              await db
                .repository<WorkItem>('qcWorkItems')
                .findMany({ filter: { lastRunId: runId } })
            ).filter((i) => i.runId !== runId),
          ],
        },
      });
    });
    // Whether starting a run also creates its NocoProject task; the browser shows how execution is triggered.
    router.get('/execution', (c) =>
      c.json({
        data: {
          nocoproject: nocoProjectConfigured(nocoProjectConfig()),
          deadlineHours: nocoProjectConfig()?.deadlineHours ?? 12,
        },
      }),
    );
    // Creates the run's NocoProject task. A failure is kept on the run so it can be retried; the run stays started.
    const dispatchRun = async (
      projectId: number,
      run: Run,
      requestUrl: string,
    ) => {
      const config = nocoProjectConfig();
      if (!nocoProjectConfigured(config)) return run;
      const project = await db
        .repository<Project>('qcProjects')
        .findOne({ filter: { id: projectId } });
      const values = await createNocoProjectTask(
        config!,
        runTaskRequest({
          projectId,
          projectName: project?.name ?? '',
          runId: run.id,
          runKey: run.key,
          total: run.plan?.length ?? 0,
          deadlineAt: run.deadlineAt ?? '',
          link: runLink(requestUrl, projectId, run.id),
        }),
      ).then(
        (task) => ({
          externalTaskId: task.id,
          externalTaskKey: task.key,
          externalTaskUrl: task.url,
          dispatchError: null,
        }),
        (error: unknown) => ({
          dispatchError: (error instanceof Error
            ? error.message
            : String(error)
          ).slice(0, 500),
        }),
      );
      return (
        await db
          .repository<Run>('qcRuns')
          .updateOne({ filter: { id: run.id }, values })
      ).record;
    };
    router.post('/projects/:id/runs', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      z.object({})
        .strict()
        .parse(await c.req.json().catch(() => ({})));
      const run = await startRun(
        db,
        projectId,
        userId(c),
        nocoProjectConfig()?.deadlineHours ?? 12,
      );
      const dispatched = await dispatchRun(projectId, run, c.req.url);
      return c.json(
        { data: { ...dispatched, displayStatus: displayStatus(dispatched) } },
        201,
      );
    });
    router.post('/projects/:id/runs/:runId/dispatch', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const runId = id.parse(c.req.param('runId'));
      const run = await db
        .repository<Run>('qcRuns')
        .findOne({ filter: { id: runId, projectId } });
      if (!run) throw new HTTPException(404, { message: 'RUN_NOT_FOUND' });
      if (run.status !== 'running' || !run.plan)
        throw new HTTPException(409, { message: 'RUN_FINISHED' });
      if (run.externalTaskId)
        throw new HTTPException(409, { message: 'ALREADY_DISPATCHED' });
      if (!nocoProjectConfigured(nocoProjectConfig()))
        throw new HTTPException(409, { message: 'NOCOPROJECT_NOT_CONFIGURED' });
      const dispatched = await dispatchRun(projectId, run, c.req.url);
      return c.json({
        data: { ...dispatched, displayStatus: displayStatus(dispatched) },
      });
    });
    // The executor reports one Check × object at a time; repeating a report replaces it.
    router.post('/projects/:id/runs/:runId/results', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const runId = id.parse(c.req.param('runId'));
      const input = resultReportSchema.parse(await c.req.json());
      return c.json({
        data: await recordResult(db, projectId, runId, input, userId(c)),
      });
    });
    router.post('/projects/:id/runs/:runId/finish', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const runId = id.parse(c.req.param('runId'));
      const input = runFinishSchema.parse(await c.req.json().catch(() => ({})));
      const run = await finishRun(
        db,
        app.container.resolve(notificationServiceToken),
        projectId,
        runId,
        input,
      );
      return c.json({ data: { ...run, displayStatus: displayStatus(run) } });
    });
    // Human-judged Checks: the current state of every pair, one pair's history, and setting several pairs at once.
    router.get('/projects/:id/manual-states', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const checkId = c.req.query('checkId');
      const objectId = c.req.query('objectId');
      if (checkId || objectId)
        return c.json({
          data: await manualStateHistory(
            db,
            projectId,
            id.parse(checkId),
            id.parse(objectId),
          ),
        });
      return c.json({ data: await listManualStates(db, projectId) });
    });
    router.post('/projects/:id/manual-states', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const input = manualStateSchema.parse(await c.req.json());
      return c.json(
        { data: await setManualStates(db, projectId, input, userId(c)) },
        201,
      );
    });
    router.get('/projects/:id/work-items', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const mine = c.req.query('scope') !== 'all';
      const items = await db.repository<WorkItem>('qcWorkItems').findMany({
        filter: { projectId, ...(mine ? { assigneeId: userId(c) } : {}) },
      });
      const runs = await db
        .repository<Run>('qcRuns')
        .findMany({ filter: { projectId } });
      return c.json({
        data: items
          .sort((a, b) => b.id - a.id)
          .map((i) => ({
            ...i,
            runKey:
              runs.find((r) => r.id === (i.lastRunId ?? i.runId))?.key ?? '',
          })),
      });
    });
    const contextText = z.string().trim().min(1).max(20000);
    // A to-do filed outside any run must carry enough context for someone else to take it over.
    router.post('/projects/:id/work-items', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const input = z
        .object({
          title: z.string().trim().min(1).max(300),
          assigneeId: z.string().min(1).max(64),
          prUrl: z.url().max(500).nullable().optional(),
          objectId: id.nullable().optional(),
          checkId: id.nullable().optional(),
          problem: contextText,
          scenario: contextText,
          actualExpected: contextText.nullable().optional(),
          evidence: contextText,
          impact: contextText.nullable().optional(),
          handling: contextText,
        })
        .strict()
        .parse(await c.req.json());
      if (
        input.objectId &&
        !(await db.repository<TestObject>('qcObjects').exists({
          filter: { id: input.objectId, projectId },
        }))
      )
        throw new HTTPException(400, { message: 'INVALID_OBJECT' });
      if (
        input.checkId &&
        !(await db.repository<Check>('qcChecks').exists({
          filter: { id: input.checkId, projectId },
        }))
      )
        throw new HTTPException(400, { message: 'INVALID_CHECK' });
      const item = (
        await db.repository<WorkItem>('qcWorkItems').createOne({
          values: {
            projectId,
            source: 'manual',
            runId: null,
            resultId: null,
            checkId: input.checkId ?? null,
            objectId: input.objectId ?? null,
            kind: input.prUrl ? 'pr_review' : 'manual',
            title: input.title,
            assigneeId: input.assigneeId,
            prUrl: input.prUrl ?? null,
            prState: input.prUrl ? 'open' : null,
            problem: input.problem,
            scenario: input.scenario,
            actualExpected: input.actualExpected ?? null,
            evidence: input.evidence,
            impact: input.impact ?? null,
            handling: input.handling,
            status: 'open',
            createdAt: new Date().toISOString(),
            createdBy: userId(c),
          },
        })
      ).record;
      return c.json({ data: item }, 201);
    });
    router.get('/projects/:id/work-items/:itemId', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const itemId = id.parse(c.req.param('itemId'));
      const item = await db
        .repository<WorkItem>('qcWorkItems')
        .findOne({ filter: { id: itemId, projectId } });
      if (!item)
        throw new HTTPException(404, { message: 'WORK_ITEM_NOT_FOUND' });
      // The latest result and run the to-do tracks, and every result of its Check × object, newest first.
      const resultId = item.lastResultId ?? item.resultId;
      const runId = item.lastRunId ?? item.runId;
      const result = resultId
        ? await db
            .repository<Result>('qcResults')
            .findOne({ filter: { id: resultId } })
        : null;
      const run = runId
        ? await db.repository<Run>('qcRuns').findOne({ filter: { id: runId } })
        : null;
      const runs = await db
        .repository<Run>('qcRuns')
        .findMany({ filter: { projectId } });
      const history =
        item.checkId && item.objectId
          ? (
              await db.repository<Result>('qcResults').findMany({
                filter: {
                  projectId,
                  checkId: item.checkId,
                  objectId: item.objectId,
                },
              })
            )
              .map((r) => {
                const of = runs.find((x) => x.id === r.runId);
                return {
                  id: r.id,
                  runId: r.runId,
                  runKey: of?.key ?? '',
                  startedAt: of?.startedAt ?? '',
                  conclusion: r.conclusion,
                  note: r.note,
                  prUrl: r.prUrl,
                };
              })
              .sort((x, y) => y.startedAt.localeCompare(x.startedAt))
              .slice(0, 30)
          : [];
      return c.json({
        data: {
          item,
          result,
          history,
          run: run && {
            id: run.id,
            key: run.key,
            environment: run.environment,
            startedAt: run.startedAt,
          },
        },
      });
    });
    // PR states come from the executor's gh; the server has no GitHub credentials of its own.
    router.post('/projects/:id/work-items/pr-states', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const { items } = z
        .object({
          items: z
            .array(
              z
                .object({ id, state: z.enum(['open', 'merged', 'closed']) })
                .strict(),
            )
            .min(1)
            .max(1000),
        })
        .strict()
        .parse(await c.req.json());
      const now = new Date().toISOString();
      await db.transaction(async (conn) => {
        const repo = conn.repository<WorkItem>('qcWorkItems');
        for (const entry of items) {
          if (!(await repo.exists({ filter: { id: entry.id, projectId } })))
            throw new HTTPException(400, { message: 'INVALID_WORK_ITEM' });
          await repo.updateOne({
            filter: { id: entry.id, projectId },
            values: { prState: entry.state, prSyncedAt: now },
          });
        }
      });
      return c.json({ data: { updated: items.length } });
    });
    // Marks to-dos done in bulk; a to-do stays open until someone handles it, even if a later run passes.
    router.post('/projects/:id/work-items/complete', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const { ids } = z
        .object({ ids: z.array(id).min(1).max(1000) })
        .strict()
        .parse(await c.req.json());
      const now = new Date().toISOString();
      const done = await db.transaction(async (conn) => {
        const repo = conn.repository<WorkItem>('qcWorkItems');
        let count = 0;
        for (const itemId of new Set(ids)) {
          const item = await repo.findOne({
            filter: { id: itemId, projectId },
          });
          if (!item)
            throw new HTTPException(400, { message: 'INVALID_WORK_ITEM' });
          if (item.status === 'done') continue;
          await repo.updateOne({
            filter: { id: itemId, projectId },
            values: { status: 'done', doneAt: now, doneBy: userId(c) },
          });
          count += 1;
        }
        return count;
      });
      return c.json({ data: { done } });
    });
    root.route('/quality', router);
    return root;
  }),
];
