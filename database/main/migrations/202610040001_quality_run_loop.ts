import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '202610040001_quality_run_loop',
  async up({ builder }) {
    // A run is started here, dispatched to NocoProject, and filled one result at a time by the executor.
    await builder.alterCollection('qcRuns', (c) => {
      // The Check × object pairs this run must report, with the standard version each one uses.
      c.json('plan', { nullable: true });
      // A running run past this time is shown as not reported back.
      c.string('deadlineAt', { length: 50, nullable: true });
      c.string('triggeredBy', { length: 64, nullable: true });
      c.string('externalTaskId', { length: 100, nullable: true });
      c.string('externalTaskKey', { length: 100, nullable: true });
      c.string('externalTaskUrl', { length: 500, nullable: true });
      c.string('dispatchError', { length: 500, nullable: true });
    });
    // How a Check is judged is part of its standard: a script, the executing Agent, a separate session or a person.
    await builder.alterCollection('qcStandards', (c) => {
      c.string('judgeMode', {
        length: 20,
        nullable: false,
        defaultValue: 'agent',
      });
      c.text('command', { nullable: true });
    });
    // Why a Check exists: the problem, PR or report it guards against.
    await builder.alterCollection('qcChecks', (c) => {
      c.text('source', { nullable: true });
    });
    // A result whose standard requires human review waits for a person before it counts.
    await builder.alterCollection('qcResults', (c) => {
      c.string('reviewStatus', { length: 20, nullable: true });
      c.string('reportedConclusion', { length: 20, nullable: true });
      c.string('reviewedBy', { length: 64, nullable: true });
      c.string('reviewedAt', { length: 50, nullable: true });
      c.text('reviewNote', { nullable: true });
      c.string('reportedAt', { length: 50, nullable: true });
    });
    // Skills, packages and documentation pages that belong to an object, so material reviews have a home.
    await builder.alterCollection('qcObjects', (c) => {
      c.json('materials', { nullable: true });
    });
  },
  // On SQLite, dropping a column rebuilds the table, which fails while other tables reference it through foreign
  // keys (verified 2026-10-04: "DROP TABLE qc_objects - FOREIGN KEY constraint failed"); the failed rollback
  // changes nothing. down() runs as written on PostgreSQL, where it was verified.
  async down({ builder }) {
    await builder.alterCollection('qcObjects', (c) => {
      c.dropField('materials');
    });
    await builder.alterCollection('qcResults', (c) => {
      c.dropFields(
        'reportedAt',
        'reviewNote',
        'reviewedAt',
        'reviewedBy',
        'reportedConclusion',
        'reviewStatus',
      );
    });
    await builder.alterCollection('qcChecks', (c) => {
      c.dropField('source');
    });
    await builder.alterCollection('qcStandards', (c) => {
      c.dropFields('command', 'judgeMode');
    });
    await builder.alterCollection('qcRuns', (c) => {
      c.dropFields(
        'dispatchError',
        'externalTaskUrl',
        'externalTaskKey',
        'externalTaskId',
        'triggeredBy',
        'deadlineAt',
        'plan',
      );
    });
  },
});
