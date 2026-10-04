import {
  defineAppConfig,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';

// Where a started run is dispatched: a NocoProject issue assigned to the executing Agent.
// Without url, apiKey and projectId, runs are still started and the executor is triggered by hand.
export interface NocoProjectConfig {
  // NocoProject application base including its mount path, without /api, such as https://project.nocobase.cn/main.
  url?: string;
  apiKey?: string;
  projectId?: string;
  agentId?: string;
  // A running run shows as not reported back after this many hours.
  deadlineHours: number;
}

const nocoproject: AppConfigFactory<NocoProjectConfig> = defineAppConfig({
  defaults: { deadlineHours: 12 } as NocoProjectConfig,
  env: {
    NOCOPROJECT_URL: envString('url'),
    NOCOPROJECT_API_KEY: envString('apiKey'),
    NOCOPROJECT_PROJECT_ID: envString('projectId'),
    NOCOPROJECT_AGENT_ID: envString('agentId'),
  },
  async validate(value, ctx) {
    if (value.url && !/^https?:\/\//.test(value.url))
      ctx.error('url', 'must start with http:// or https://.');
    if (!(value.deadlineHours >= 1 && value.deadlineHours <= 168))
      ctx.error('deadlineHours', 'must be between 1 and 168.');
  },
});

export default nocoproject;
