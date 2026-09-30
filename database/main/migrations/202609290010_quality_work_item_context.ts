import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '202609290010_quality_work_item_context',
  async up({ builder }) {
    // To-dos also come from people or Agents outside any run, so run links become optional and each to-do
    // carries its own context: what the problem is, where it appears, evidence, impact and handling.
    await builder.alterCollection('qcWorkItems', (c) => {
      c.string('source', { length: 20, nullable: false, defaultValue: 'run' });
      c.alterField('runId', { type: 'integer', nullable: true });
      c.alterField('resultId', { type: 'integer', nullable: true });
      c.alterField('checkId', { type: 'integer', nullable: true });
      c.alterField('objectId', { type: 'integer', nullable: true });
      c.text('problem', { nullable: true });
      c.text('scenario', { nullable: true });
      c.text('actualExpected', { nullable: true });
      c.text('evidence', { nullable: true });
      c.text('impact', { nullable: true });
      c.text('handling', { nullable: true });
      c.string('prState', { length: 20, nullable: true });
      c.string('prSyncedAt', { length: 50, nullable: true });
      c.string('createdBy', { length: 64, nullable: true });
    });
  },
  async down({ builder, query }) {
    const manual = await query
      .selectFrom('qcWorkItems')
      .select('id')
      .where('source', '=', 'manual')
      .execute();
    if (manual.length)
      throw new Error('Manual to-dos exist; remove them before rollback.');
    await builder.alterCollection('qcWorkItems', (c) => {
      c.dropFields(
        'createdBy',
        'prSyncedAt',
        'prState',
        'handling',
        'impact',
        'evidence',
        'actualExpected',
        'scenario',
        'problem',
        'source',
      );
      c.alterField('objectId', { type: 'integer', nullable: false });
      c.alterField('checkId', { type: 'integer', nullable: false });
      c.alterField('resultId', { type: 'integer', nullable: false });
      c.alterField('runId', { type: 'integer', nullable: false });
    });
  },
});
