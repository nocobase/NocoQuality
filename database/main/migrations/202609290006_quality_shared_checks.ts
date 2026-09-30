import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '202609290006_quality_shared_checks',
  async up({ builder, query }) {
    // A shared Check belongs to a dimension and is inherited by every object that dimension applies to,
    // so its objectId is empty. Each task records the object it actually checked.
    await builder.alterCollection('qcChecks', (c) => {
      c.string('scope', { length: 20, nullable: false, defaultValue: 'object' });
      c.alterField('objectId', { type: 'integer', nullable: true });
    });
    await builder.alterCollection('qcTasks', (c) => {
      c.integer('objectId', { nullable: true });
      c.foreignKey('objectId', {
        references: { collection: 'qcObjects', fields: ['id'] },
        name: 'fk_qc_task_object',
      });
    });
    const checks = await query.selectFrom('qcChecks').selectAll().execute();
    for (const check of checks)
      await query
        .updateTable('qcTasks')
        .set({ objectId: check.objectId })
        .where('checkId', '=', check.id)
        .execute();
  },
  async down({ builder, query }) {
    // Shared Checks cannot be expressed without scope; refuse instead of guessing an owning object.
    const shared = await query
      .selectFrom('qcChecks')
      .select('id')
      .where('scope', '=', 'shared')
      .execute();
    if (shared.length)
      throw new Error('Shared Checks exist; archive them before rollback.');
    await builder.alterCollection('qcTasks', (c) => {
      c.dropConstraint('fk_qc_task_object');
      c.dropField('objectId');
    });
    await builder.alterCollection('qcChecks', (c) => {
      c.alterField('objectId', { type: 'integer', nullable: false });
      c.dropField('scope');
    });
  },
});
