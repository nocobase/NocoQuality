import { importRun, runImportSchema } from '../quality/runs.js';
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
  Task,
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
    steps: text,
    passCriteria: text,
    evidence: text,
    humanReview: z.boolean(),
  })
  .strict();
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
    dimensionIds: z.array(id).min(1).max(50),
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
    ...standardSchema.shape,
  })
  .strict()
  .refine((v) => (v.scope === 'shared') === (v.objectId === undefined));
const taskSchema = z
  .object({
    checkId: id,
    standardId: id,
    revision: z.string().trim().min(1).max(160),
    environment: z.string().trim().min(1).max(160),
    objectId: id.optional(),
    requestKey: z.uuid(),
  })
  .strict();

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
    router.use('*', auth.required(), authz.middleware());
    // Initial delivery is a root-managed quality workspace. No member gains access through frontend project filtering.
    router.use('*', async (c, next) => {
      if (!(await c.get('authz').snapshot()).unrestricted)
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
      // Tasks of archived Checks stay stored as evidence but leave the workspace with their Check.
      const activeCheckIds = new Set(checks.map((check) => check.id));
      const tasks = (
        await db.repository<Task>('qcTasks').findMany({ filter: { projectId } })
      ).filter((task) => activeCheckIds.has(task.checkId));
      const applicability = await db
        .repository<Applicability>('qcApplicability')
        .findMany({ filter: { projectId } });
      const exclusions = (
        await db
          .repository<CheckExclusion>('qcCheckExclusions')
          .findMany({ filter: { projectId } })
      ).filter((row) => activeCheckIds.has(row.checkId));
      return c.json({
        data: {
          exclusions,
          project,
          // TM3 is a separate system; its imported snapshot stays stored but is no longer part of the workspace.
          objects: objects.map(
            ({ sourceSnapshot: _snapshot, ...object }) => object,
          ),
          dimensions: dimensions.sort((a, b) => a.position - b.position),
          checks,
          standards,
          tasks: tasks.sort((a, b) => b.id - a.id),
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
              description: '',
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
        ...standard
      } = checkSchema.parse(await c.req.json());
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
      const { baseVersion, ...standard } = standardSchema
        .extend({ baseVersion: id })
        .strict()
        .parse(await c.req.json());
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
    router.post('/projects/:id/tasks', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const input = taskSchema.parse(await c.req.json());
      const previous = await db
        .repository<Task>('qcTasks')
        .findOne({ filter: { requestKey: input.requestKey, projectId } });
      if (previous) {
        if (
          previous.checkId !== input.checkId ||
          previous.standardId !== input.standardId ||
          previous.revision !== input.revision ||
          previous.environment !== input.environment ||
          (input.objectId !== undefined && previous.objectId !== input.objectId)
        )
          throw new HTTPException(409, { message: 'IDEMPOTENCY_CONFLICT' });
        return c.json({ data: previous });
      }
      const result = await db.transaction(async (conn) => {
        const check = await conn
          .repository<Check>('qcChecks')
          .findOne({ filter: { id: input.checkId, projectId, active: true } });
        if (!check) throw new HTTPException(400, { message: 'INVALID_CHECK' });
        // An object Check always runs on its own object; a shared Check runs on one object that inherits it.
        const objectId =
          check.scope === 'shared' ? input.objectId : check.objectId;
        if (
          !objectId ||
          (input.objectId !== undefined && input.objectId !== objectId) ||
          !(await conn.repository<Applicability>('qcApplicability').exists({
            filter: { projectId, objectId, dimensionId: check.dimensionId },
          })) ||
          !(await conn.repository<TestObject>('qcObjects').exists({
            filter: { id: objectId, projectId, active: true },
          }))
        )
          throw new HTTPException(400, { message: 'INVALID_OBJECT' });
        if (
          await conn.repository<TestObject>('qcObjects').exists({
            filter: { id: objectId, projectId, testingPaused: true },
          })
        )
          throw new HTTPException(409, { message: 'OBJECT_PAUSED' });
        if (
          await conn.repository<CheckExclusion>('qcCheckExclusions').exists({
            filter: { checkId: check.id, objectId },
          })
        )
          throw new HTTPException(409, { message: 'CHECK_DISABLED' });
        if (
          !(await conn.repository<Standard>('qcStandards').exists({
            filter: {
              id: input.standardId,
              checkId: input.checkId,
              published: true,
            },
          }))
        )
          throw new HTTPException(400, { message: 'INVALID_STANDARD' });
        return (
          await conn.repository<Task>('qcTasks').createOne({
            values: {
              ...input,
              objectId,
              projectId,
              executionStatus: 'pending_dispatch',
              conclusion: 'not_run',
              evidence: '',
              createdAt: new Date().toISOString(),
            },
          })
        ).record;
      });
      return c.json({ data: result }, 201);
    });
    router.post('/projects/:id/tasks/:taskId/result', async (c) => {
      const projectId = id.parse(c.req.param('id'));
      const taskId = id.parse(c.req.param('taskId'));
      const input = z
        .object({
          revision: z.string().trim().min(1).max(160),
          evidence: z.string().trim().min(100).max(100000),
          executionStatus: z.enum(['completed', 'failed']),
          // Only two conclusions exist; a Check that could not be evaluated is not passed.
          conclusion: z.enum(['passed', 'failed']),
        })
        .strict()
        .parse(await c.req.json());
      const result = await db.transaction(async (conn) => {
        const repo = conn.repository<Task>('qcTasks');
        const task = await repo.findOne({ filter: { id: taskId, projectId } });
        if (!task) throw new HTTPException(404, { message: 'TASK_NOT_FOUND' });
        if (task.revision !== input.revision)
          throw new HTTPException(409, { message: 'CONFLICT' });
        if (
          task.executionStatus === input.executionStatus &&
          task.conclusion === input.conclusion &&
          task.evidence === input.evidence
        )
          return task;
        if (!['pending_dispatch', 'running'].includes(task.executionStatus))
          throw new HTTPException(409, { message: 'CONFLICT' });
        const updated = await repo.updateOne({
          filter: {
            id: taskId,
            projectId,
            executionStatus: task.executionStatus,
          },
          values: {
            executionStatus: input.executionStatus,
            conclusion: input.conclusion,
            evidence: input.evidence,
          },
        });
        return updated.record;
      });
      return c.json({ data: result });
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
          .map(({ steps: _steps, scope: _scope, ...run }) => ({
            ...run,
            passed: results.filter(
              (r) => r.runId === run.id && r.conclusion === 'passed',
            ).length,
            failed: results.filter(
              (r) => r.runId === run.id && r.conclusion === 'failed',
            ).length,
            openItems: items.filter(
              (i) => i.runId === run.id && i.status === 'open',
            ).length,
            prs: items.filter((i) => i.runId === run.id && i.prUrl).length,
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
          run,
          results: await db
            .repository<Result>('qcResults')
            .findMany({ filter: { runId } }),
          workItems: await db
            .repository<WorkItem>('qcWorkItems')
            .findMany({ filter: { runId } }),
        },
      });
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
            runKey: runs.find((r) => r.id === i.runId)?.key ?? '',
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
      const result = item.resultId
        ? await db
            .repository<Result>('qcResults')
            .findOne({ filter: { id: item.resultId } })
        : null;
      const run = item.runId
        ? await db
            .repository<Run>('qcRuns')
            .findOne({ filter: { id: item.runId } })
        : null;
      return c.json({
        data: {
          item,
          result,
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
