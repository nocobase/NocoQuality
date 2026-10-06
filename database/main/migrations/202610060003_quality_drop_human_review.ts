import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '202610060003_quality_drop_human_review',
  // On SQLite the builder drops a column by rebuilding the table. Inside a transaction the foreign keys of results
  // that reference standards stay on and fail the rebuild (verified 2026-10-06: "DROP TABLE qc_standards - FOREIGN KEY
  // constraint failed", and deferring the check only moves the failure to COMMIT). Outside one, the rebuild turns the
  // check off for its own duration. The migration is this single change, so it still applies all or nothing.
  transaction: false,
  async up({ builder }) {
    // Whether a standard requires review no longer exists: automated conclusions take effect as reported.
    await builder.alterCollection('qcStandards', (c) => {
      c.dropField('humanReview');
    });
  },
  // Brings the column back without review on any standard.
  async down({ builder }) {
    await builder.alterCollection('qcStandards', (c) => {
      c.boolean('humanReview', { defaultValue: false });
    });
  },
});
