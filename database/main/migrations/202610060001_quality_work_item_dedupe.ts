import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '202610060001_quality_work_item_dedupe',
  async up({ builder }) {
    // One open to-do per Check × object: a later run that fails the same pair updates it instead of adding another.
    // runId/resultId keep the run that first raised it; these fields point to where it was last seen.
    await builder.alterCollection('qcWorkItems', (c) => {
      c.integer('lastRunId', { nullable: true });
      c.integer('lastResultId', { nullable: true });
      c.integer('occurrences', { nullable: false, defaultValue: 1 });
      c.string('lastSeenAt', { length: 50, nullable: true });
    });
  },
  // On SQLite dropping these columns rebuilds a table other tables reference, which fails without changing anything
  // (see 202610040001_quality_run_loop); down() runs as written on PostgreSQL.
  async down({ builder }) {
    await builder.alterCollection('qcWorkItems', (c) => {
      c.dropFields('lastSeenAt', 'occurrences', 'lastResultId', 'lastRunId');
    });
  },
});
