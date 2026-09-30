import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '202609290008_quality_object_testing_pause',
  async up({ builder }) {
    // Objects still under development can be left out of full runs without archiving their definitions.
    await builder.alterCollection('qcObjects', (c) => {
      c.boolean('testingPaused', { nullable: false, defaultValue: false });
      c.string('pausedReason', { length: 500, nullable: true });
    });
  },
  async down({ builder }) {
    await builder.alterCollection('qcObjects', (c) => {
      c.dropField('pausedReason');
      c.dropField('testingPaused');
    });
  },
});
