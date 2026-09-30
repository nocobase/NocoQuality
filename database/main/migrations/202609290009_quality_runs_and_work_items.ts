import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '202609290009_quality_runs_and_work_items',
  async up({ builder }) {
    // How a not-passed result is handled: the executing Agent opens a PR, or a person takes it over.
    await builder.alterCollection('qcChecks', (c) => {
      c.string('fixMode', {
        length: 20,
        nullable: false,
        defaultValue: 'assign',
      });
      c.string('assigneeId', { length: 64, nullable: true });
    });
    // One execution of the project's enabled Checks, imported from the executor's run.json.
    await builder.createCollection('qcRuns', (c) => {
      c.increments('id');
      c.integer('projectId', { nullable: false });
      c.string('key', { length: 40, nullable: false });
      c.string('status', { length: 20, nullable: false });
      c.string('executor', { length: 200, nullable: true });
      c.string('startedAt', { length: 50, nullable: false });
      c.string('finishedAt', { length: 50, nullable: true });
      c.json('environment', { nullable: true });
      c.json('scope', { nullable: true });
      c.json('steps', { nullable: true });
      c.string('importedAt', { length: 50, nullable: false });
      c.string('importedBy', { length: 64, nullable: true });
      c.unique(['projectId', 'key'], { name: 'uq_qc_run_project_key' });
      c.foreignKey('projectId', {
        references: { collection: 'qcProjects', fields: ['id'] },
        name: 'fk_qc_run_project',
      });
    });
    // Conclusions are only passed or failed; a Check without a result in a run is not run.
    await builder.createCollection('qcResults', (c) => {
      c.increments('id');
      c.integer('projectId', { nullable: false });
      c.integer('runId', { nullable: false });
      c.integer('checkId', { nullable: false });
      c.integer('standardId', { nullable: false });
      c.integer('objectId', { nullable: false });
      c.string('conclusion', { length: 20, nullable: false });
      c.text('note', { nullable: true });
      c.text('evidence', { nullable: true });
      c.string('evidencePath', { length: 500, nullable: true });
      c.string('prUrl', { length: 500, nullable: true });
      c.unique(['runId', 'checkId', 'objectId'], {
        name: 'uq_qc_result_run_check_object',
      });
      c.foreignKey('runId', {
        references: { collection: 'qcRuns', fields: ['id'] },
        name: 'fk_qc_result_run',
      });
      c.foreignKey('checkId', {
        references: { collection: 'qcChecks', fields: ['id'] },
        name: 'fk_qc_result_check',
      });
      c.foreignKey('standardId', {
        references: { collection: 'qcStandards', fields: ['id'] },
        name: 'fk_qc_result_standard',
      });
      c.foreignKey('objectId', {
        references: { collection: 'qcObjects', fields: ['id'] },
        name: 'fk_qc_result_object',
      });
    });
    // Each not-passed result becomes one to-do for a person: review the PR, or handle it by hand.
    await builder.createCollection('qcWorkItems', (c) => {
      c.increments('id');
      c.integer('projectId', { nullable: false });
      c.integer('runId', { nullable: false });
      c.integer('resultId', { nullable: false });
      c.integer('checkId', { nullable: false });
      c.integer('objectId', { nullable: false });
      c.string('kind', { length: 20, nullable: false });
      c.string('title', { length: 300, nullable: false });
      c.string('assigneeId', { length: 64, nullable: false });
      c.string('prUrl', { length: 500, nullable: true });
      c.string('status', { length: 20, nullable: false });
      c.string('createdAt', { length: 50, nullable: false });
      c.string('doneAt', { length: 50, nullable: true });
      c.string('doneBy', { length: 64, nullable: true });
      c.unique('resultId', { name: 'uq_qc_work_item_result' });
      c.foreignKey('resultId', {
        references: { collection: 'qcResults', fields: ['id'] },
        name: 'fk_qc_work_item_result',
      });
      c.foreignKey('runId', {
        references: { collection: 'qcRuns', fields: ['id'] },
        name: 'fk_qc_work_item_run',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('qcWorkItems');
    await builder.dropCollection('qcResults');
    await builder.dropCollection('qcRuns');
    await builder.alterCollection('qcChecks', (c) => {
      c.dropField('assigneeId');
      c.dropField('fixMode');
    });
  },
});
