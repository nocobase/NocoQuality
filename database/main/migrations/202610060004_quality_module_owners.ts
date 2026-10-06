import { defineMigration } from '@nocobase/db';

// The owner tm3 recorded for an imported object, by name; an object created here has no snapshot.
function snapshotOwner(snapshot: unknown) {
  let value = snapshot;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const owner =
    value && typeof value === 'object'
      ? (value as { owner?: unknown }).owner
      : null;
  return typeof owner === 'string' && owner.trim() ? owner.trim() : null;
}

export default defineMigration({
  name: '202610060004_quality_module_owners',
  async up({ builder, query }) {
    // Owners live on modules: the owner of an object is the first person responsible for every Check on it, so
    // to-dos raised by its failures go to them and they keep its human-judged Check states. Checks no longer carry
    // an assignee; qcChecks.assigneeId stays, unwritten, because dropping it on SQLite rebuilds a referenced table.
    await builder.alterCollection('qcObjects', (c) => {
      c.string('ownerId', { length: 64, nullable: true });
    });
    // A to-do whose module has no owner is unassigned rather than falling to whoever triggered the run.
    await builder.alterCollection('qcWorkItems', (c) => {
      c.alterField('assigneeId', {
        type: 'string',
        length: 64,
        nullable: true,
      });
    });
    // Every change of a to-do's handler, with who changed it and when. No foreign key to qcWorkItems, so that a
    // later column change there does not have to rebuild a referenced table on SQLite.
    await builder.createCollection('qcWorkItemAssignments', (c) => {
      c.increments('id');
      c.integer('projectId', { nullable: false });
      c.integer('workItemId', { nullable: false });
      c.string('fromAssigneeId', { length: 64, nullable: true });
      c.string('toAssigneeId', { length: 64, nullable: true });
      c.string('changedBy', { length: 64, nullable: false });
      c.string('changedAt', { length: 50, nullable: false });
      c.index(['workItemId']);
      c.foreignKey('projectId', {
        references: { collection: 'qcProjects', fields: ['id'] },
        name: 'fk_qc_work_item_assignment_project',
      });
    });
    // Owners imported from tm3 are names; an object takes the one enabled account with exactly that name.
    // Existing to-dos keep their assignee.
    const objects = (
      await query
        .selectFrom('qcObjects')
        .select(['id', 'projectId', 'name', 'sourceSnapshot'])
        .execute<{
          id: number;
          projectId: number;
          name: string;
          sourceSnapshot: unknown;
        }>()
    )
      .map((o) => ({ ...o, owner: snapshotOwner(o.sourceSnapshot) }))
      .filter((o) => o.owner);
    if (!objects.length) return;
    const users = await query
      .selectFrom('user')
      .select(['id', 'name', 'disabledAt'])
      .execute<{ id: string; name: string | null; disabledAt: unknown }>();
    const byName = new Map<string, string[]>();
    for (const u of users) {
      if (u.disabledAt) continue;
      const key = String(u.name ?? '').trim();
      byName.set(key, [...(byName.get(key) ?? []), String(u.id)]);
    }
    const unmatched: string[] = [];
    let filled = 0;
    for (const o of objects) {
      const ids = byName.get(o.owner!) ?? [];
      if (ids.length !== 1) {
        unmatched.push(
          `#${o.id} ${o.name} (project ${o.projectId}): ${o.owner}` +
            (ids.length ? ` matches ${ids.length} accounts` : ''),
        );
        continue;
      }
      await query
        .updateTable('qcObjects')
        .set({ ownerId: ids[0] })
        .where('id', '=', o.id)
        .execute();
      filled += 1;
    }
    console.info(
      `[202610060004_quality_module_owners] module owners from tm3: ${filled} filled, ${unmatched.length} left empty`,
    );
    for (const line of unmatched)
      console.warn('[202610060004_quality_module_owners] no owner for ' + line);
  },
  // Unassigned to-dos have nobody to fall back to, so they block the rollback. On SQLite dropping ownerId rebuilds a
  // table other tables reference, which fails without changing anything (see 202610040001_quality_run_loop); down()
  // runs as written on PostgreSQL.
  async down({ builder, query }) {
    const unassigned = await query
      .selectFrom('qcWorkItems')
      .select('id')
      .where('assigneeId', 'is', null)
      .execute();
    if (unassigned.length)
      throw new Error('Unassigned to-dos exist; assign them before rollback.');
    await builder.dropCollection('qcWorkItemAssignments');
    await builder.alterCollection('qcWorkItems', (c) => {
      c.alterField('assigneeId', {
        type: 'string',
        length: 64,
        nullable: false,
      });
    });
    await builder.alterCollection('qcObjects', (c) => {
      c.dropField('ownerId');
    });
  },
});
