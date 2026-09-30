import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609290001_quality_center',
  async up({ builder }) {
    await builder.createCollection('qcProjects', (c) => {
      c.increments('id');
      c.string('key', { length: 80, nullable: false });
      c.string('name', { length: 120, nullable: false });
      c.string('type', { length: 40, nullable: false });
      c.text('description');
      c.boolean('active', { defaultValue: true });
      c.unique('key');
    });
    await builder.createCollection('qcDimensions', (c) => {
      c.increments('id');
      c.integer('projectId', { nullable: false });
      c.string('key', { length: 80, nullable: false });
      c.string('name', { length: 120, nullable: false });
      c.integer('position', { defaultValue: 0 });
      c.boolean('active', { defaultValue: true });
      c.index(['projectId', 'key']);
    });
    await builder.createCollection('qcObjects', (c) => {
      c.increments('id');
      c.integer('projectId', { nullable: false });
      c.string('key', { length: 80, nullable: false });
      c.string('name', { length: 120, nullable: false });
      c.string('category', { length: 40, nullable: false });
      c.text('description');
      c.boolean('active', { defaultValue: true });
      c.index(['projectId', 'key']);
    });
    await builder.createCollection('qcChecks', (c) => {
      c.increments('id');
      c.integer('projectId', { nullable: false });
      c.integer('objectId', { nullable: false });
      c.integer('dimensionId', { nullable: false });
      c.string('key', { length: 80, nullable: false });
      c.string('name', { length: 160, nullable: false });
      c.boolean('active', { defaultValue: true });
      c.index(['projectId', 'objectId', 'dimensionId']);
    });
    await builder.createCollection('qcStandards', (c) => {
      c.increments('id');
      c.integer('checkId', { nullable: false });
      c.integer('version', { nullable: false });
      c.text('definition', { nullable: false });
      c.text('preconditions');
      c.text('steps');
      c.text('passCriteria');
      c.text('evidence');
      c.boolean('humanReview', { defaultValue: true });
      c.boolean('published', { defaultValue: true });
      c.unique(['checkId', 'version']);
    });
    await builder.createCollection('qcTasks', (c) => {
      c.increments('id');
      c.integer('projectId', { nullable: false });
      c.integer('checkId', { nullable: false });
      c.integer('standardId', { nullable: false });
      c.string('revision', { length: 160, nullable: false });
      c.string('environment', { length: 160, nullable: false });
      c.string('executionStatus', {
        length: 40,
        nullable: false,
        defaultValue: 'pending_dispatch',
      });
      c.string('conclusion', {
        length: 40,
        nullable: false,
        defaultValue: 'not_run',
      });
      c.text('evidence');
      c.index(['projectId', 'executionStatus']);
    });
  },
  async down({ builder }) {
    await builder.dropCollection('qcTasks');
    await builder.dropCollection('qcStandards');
    await builder.dropCollection('qcChecks');
    await builder.dropCollection('qcObjects');
    await builder.dropCollection('qcDimensions');
    await builder.dropCollection('qcProjects');
  },
});

export default migration;
