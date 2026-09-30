import { defineAppDatabaseConfig } from '@nocobase/app-server/database';

/** The runtime loads the installed PostgreSQL driver before provider registration. */
export default defineAppDatabaseConfig(() => ({
  default: 'main',
  connections: {
    main: {
      dialect: 'postgres',
      schemaManagement: 'managed',
      debug: false,
    },
  },
}));
