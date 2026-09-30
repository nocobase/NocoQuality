import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '202609290007_quality_check_exclusions',
  async up({ builder }) {
    // A shared Check applies to every object of its dimension unless that object turns it off here.
    await builder.createCollection('qcCheckExclusions', (c) => {
      c.increments('id');
      c.integer('projectId', { nullable: false });
      c.integer('checkId', { nullable: false });
      c.integer('objectId', { nullable: false });
      c.string('reason', { length: 500, nullable: true });
      c.string('createdAt', { length: 50, nullable: false });
      c.unique(['checkId', 'objectId'], {
        name: 'uq_qc_exclusion_check_object',
      });
      c.foreignKey('projectId', {
        references: { collection: 'qcProjects', fields: ['id'] },
        name: 'fk_qc_exclusion_project',
      });
      c.foreignKey('checkId', {
        references: { collection: 'qcChecks', fields: ['id'] },
        name: 'fk_qc_exclusion_check',
      });
      c.foreignKey('objectId', {
        references: { collection: 'qcObjects', fields: ['id'] },
        name: 'fk_qc_exclusion_object',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('qcCheckExclusions');
  },
});
