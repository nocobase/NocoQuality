import type { DatabaseManager } from '@nocobase/db';
import type { UserAdministrationService } from '@nocobase/app-plugin-authentication';

// Every business table, archived rows included. A table added by a later migration must be listed here too.
export const exportCollections = [
  'qcProjects',
  'qcDimensions',
  'qcObjects',
  'qcApplicability',
  'qcChecks',
  'qcStandards',
  'qcCheckExclusions',
  'qcTasks',
  'qcRuns',
  'qcResults',
  'qcWorkItems',
] as const;

export interface ExportedUser {
  id: string;
  name: string;
  username: string | null;
  email: string;
  disabled: boolean;
}

// The online Hub keeps no backup; this snapshot is what a restore starts from, so rows keep their original ids.
export async function exportQualityData(
  db: DatabaseManager,
  users: UserAdministrationService,
) {
  const tables: Record<string, unknown[]> = {};
  for (const collection of exportCollections)
    tables[collection] = (
      await db.repository<{ id: number }>(collection).findMany()
    ).sort((a, b) => a.id - b.id);
  return {
    format: 'nocoquality-export',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    schema: { migrations: await readMigrations(db) },
    // Owner, assignee and author fields store user ids; a restore maps them back through these accounts.
    // Only identity fields leave the server: no passwords, sessions or API keys.
    users: await listUsers(users),
    counts: Object.fromEntries(
      Object.entries(tables).map(([key, rows]) => [key, rows.length]),
    ),
    tables,
  };
}

async function listUsers(service: UserAdministrationService) {
  const users: ExportedUser[] = [];
  for (let page = 1; ; page += 1) {
    const result = await service.list({ page, pageSize: 100 });
    for (const u of result.items)
      users.push({
        id: u.id,
        name: u.name,
        username: u.username ?? null,
        email: u.email,
        disabled: u.disabledAt !== null,
      });
    if (result.items.length === 0 || users.length >= result.total) break;
  }
  return users;
}

// The deployed server has no git checkout; the applied migrations identify which schema the rows belong to.
async function readMigrations(db: DatabaseManager) {
  try {
    const rows = await db
      .query()
      .selectFrom('__nocobase_migrations')
      .select(['name', 'package_name'])
      .orderBy('id')
      .execute<{ name: string; package_name: string }>();
    return rows.map((row) => ({ name: row.name, package: row.package_name }));
  } catch {
    return null;
  }
}
