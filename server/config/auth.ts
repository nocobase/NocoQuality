import type { AppConfigFactory } from '@nocobase/app-server/config';
import { apiKey } from '@nocobase/app-plugin-api-keys/server';
import {
  defineAuthConfig,
  type AuthConfig,
} from '@nocobase/app-plugin-authentication/server';
import { username } from 'better-auth/plugins';

const auth: AppConfigFactory<AuthConfig> = defineAuthConfig({
  defaults: {
    plugins: [username({ displayUsername: false }), apiKey()],
    // Accounts are created by an administrator in Users; the deployment is public, so nobody signs themselves up.
    emailAndPassword: { enabled: true, autoSignIn: false, disableSignUp: true },
    session: { storeSessionInDatabase: true },
  },
});

export default auth;
