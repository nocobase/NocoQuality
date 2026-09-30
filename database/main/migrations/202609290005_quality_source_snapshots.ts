import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '202609290005_quality_source_snapshots',
  async up({ builder }) {
    await builder.alterCollection('qcObjects', (c) => {
      c.json('sourceSnapshot', { nullable: true });
    });
  },
  async down({ builder }) {
    await builder.alterCollection('qcObjects', (c) => {
      c.dropField('sourceSnapshot');
    });
  },
});
