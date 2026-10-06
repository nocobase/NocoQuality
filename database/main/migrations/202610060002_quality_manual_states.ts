import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '202610060002_quality_manual_states',
  async up({ builder, query }) {
    // A human-judged Check is not run: a person keeps its state for each object. Every change is a new row, so the
    // latest row of a Check × object is its current state and the earlier ones are its history; no row means unreviewed.
    await builder.createCollection('qcManualStates', (c) => {
      c.increments('id');
      c.integer('projectId', { nullable: false });
      c.integer('checkId', { nullable: false });
      c.integer('objectId', { nullable: false });
      // unreviewed, reviewed or rereview.
      c.string('status', { length: 20, nullable: false });
      // Why it changed, often a link to the review record.
      c.text('note', { nullable: true });
      c.string('createdBy', { length: 64, nullable: false });
      c.string('createdAt', { length: 50, nullable: false });
      c.index(['projectId']);
      c.index(['checkId', 'objectId']);
      c.foreignKey('projectId', {
        references: { collection: 'qcProjects', fields: ['id'] },
        name: 'fk_qc_manual_state_project',
      });
      c.foreignKey('checkId', {
        references: { collection: 'qcChecks', fields: ['id'] },
        name: 'fk_qc_manual_state_check',
      });
      c.foreignKey('objectId', {
        references: { collection: 'qcObjects', fields: ['id'] },
        name: 'fk_qc_manual_state_object',
      });
    });
    // Human review of automated results is gone: a result waiting for review takes effect as reported.
    // The review columns stay, with the reviews already confirmed, as history.
    const pending = await query
      .selectFrom('qcResults')
      .selectAll()
      .where('reviewStatus', '=', 'pending')
      .execute();
    for (const result of pending)
      await query
        .updateTable('qcResults')
        .set({
          conclusion: result.reportedConclusion ?? result.conclusion,
          reviewStatus: null,
        })
        .where('id', '=', result.id)
        .execute();
    // An open review to-do becomes the to-do of its result: kept when the result failed, done when it passed.
    const reviews = await query
      .selectFrom('qcWorkItems')
      .selectAll()
      .where('kind', '=', 'review')
      .where('status', '=', 'open')
      .execute();
    const now = new Date().toISOString();
    for (const item of reviews) {
      const resultId = item.lastResultId ?? item.resultId;
      const result = resultId
        ? await query
            .selectFrom('qcResults')
            .selectAll()
            .where('id', '=', resultId)
            .executeTakeFirst()
        : undefined;
      if (result?.conclusion === 'failed')
        await query
          .updateTable('qcWorkItems')
          .set({
            kind: item.prUrl ? 'pr_review' : 'manual',
            title: String(item.title).replace(/^复核：/, ''),
          })
          .where('id', '=', item.id)
          .execute();
      else
        await query
          .updateTable('qcWorkItems')
          .set({ status: 'done', doneAt: now, doneBy: 'system' })
          .where('id', '=', item.id)
          .execute();
    }
  },
  // Removes the table only: results and to-dos that took effect stay as they are.
  async down({ builder }) {
    await builder.dropCollection('qcManualStates');
  },
});
