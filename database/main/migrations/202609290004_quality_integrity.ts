import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '202609290004_quality_integrity',
  irreversible: true,
  async up({ builder, query }) {
    // Earlier applied migrations omitted integrity rules. Add them without rewriting migration history.
    await builder.alterCollection('qcDimensions', (c) => {
      c.unique(['projectId', 'key'], { name: 'uq_qc_dimensions_project_key' });
      c.foreignKey('projectId', {
        references: { collection: 'qcProjects', fields: ['id'] },
        name: 'fk_qc_dimension_project',
      });
    });
    await builder.alterCollection('qcObjects', (c) => {
      c.unique(['projectId', 'key'], { name: 'uq_qc_objects_project_key' });
      c.foreignKey('projectId', {
        references: { collection: 'qcProjects', fields: ['id'] },
        name: 'fk_qc_object_project',
      });
    });
    await builder.alterCollection('qcChecks', (c) => {
      c.unique(['projectId', 'key'], { name: 'uq_qc_checks_project_key' });
      c.foreignKey('projectId', {
        references: { collection: 'qcProjects', fields: ['id'] },
        name: 'fk_qc_check_project',
      });
      c.foreignKey('objectId', {
        references: { collection: 'qcObjects', fields: ['id'] },
        name: 'fk_qc_check_object',
      });
      c.foreignKey('dimensionId', {
        references: { collection: 'qcDimensions', fields: ['id'] },
        name: 'fk_qc_check_dimension',
      });
    });
    await builder.alterCollection('qcStandards', (c) => {
      c.foreignKey('checkId', {
        references: { collection: 'qcChecks', fields: ['id'] },
        name: 'fk_qc_standard_check',
      });
    });
    await builder.alterCollection('qcTasks', (c) => {
      c.string('requestKey', { length: 80, nullable: true });
      c.string('createdAt', { length: 50, nullable: true });
      c.unique('requestKey', { name: 'uq_qc_task_request' });
      c.foreignKey('standardId', {
        references: { collection: 'qcStandards', fields: ['id'] },
        name: 'fk_qc_task_standard',
      });
      c.foreignKey('projectId', {
        references: { collection: 'qcProjects', fields: ['id'] },
        name: 'fk_qc_task_project',
      });
      c.foreignKey('checkId', {
        references: { collection: 'qcChecks', fields: ['id'] },
        name: 'fk_qc_task_check',
      });
    });
    await builder.createCollection('qcApplicability', (c) => {
      c.increments('id');
      c.integer('projectId', { nullable: false });
      c.integer('objectId', { nullable: false });
      c.integer('dimensionId', { nullable: false });
      c.unique(['objectId', 'dimensionId']);
      c.foreignKey('projectId', {
        references: { collection: 'qcProjects', fields: ['id'] },
        name: 'fk_qc_app_project',
      });
      c.foreignKey('objectId', {
        references: { collection: 'qcObjects', fields: ['id'] },
        name: 'fk_qc_app_object',
      });
      c.foreignKey('dimensionId', {
        references: { collection: 'qcDimensions', fields: ['id'] },
        name: 'fk_qc_app_dimension',
      });
    });
    // Backfill the explicit applicability of the two existing project definitions. No task or result is created.
    const objects = await query.selectFrom('qcObjects').selectAll().execute();
    const dimensions = await query
      .selectFrom('qcDimensions')
      .selectAll()
      .execute();
    for (const object of objects)
      for (const dimension of dimensions)
        if (object.projectId === dimension.projectId)
          await query
            .insertInto('qcApplicability')
            .values({
              projectId: object.projectId,
              objectId: object.id,
              dimensionId: dimension.id,
            })
            .execute();
  },
});
