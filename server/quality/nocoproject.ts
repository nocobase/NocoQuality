import type { NocoProjectConfig } from '../config/nocoproject.js';

export interface DispatchRequest {
  title: string;
  description: string;
}
export interface DispatchedTask {
  id: string;
  key: string | null;
  url: string | null;
}

export function nocoProjectConfigured(config: NocoProjectConfig | undefined) {
  return !!(config?.url && config.apiKey && config.projectId);
}

// The only NocoProject call NocoQuality makes: create one issue for one run, assigned to the executing Agent.
// Kept to a single request so another execution platform can replace it.
export async function createNocoProjectTask(
  config: NocoProjectConfig,
  request: DispatchRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<DispatchedTask> {
  const base = config.url!.replace(/\/+$/, '');
  const response = await fetchImpl(base + '/api/np/issues', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey!,
    },
    body: JSON.stringify({
      projectId: config.projectId,
      title: request.title,
      description: request.description,
      ...(config.agentId
        ? { executor: { type: 'agent', id: config.agentId } }
        : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(
      'NocoProject returned HTTP ' +
        response.status +
        ': ' +
        text.slice(0, 300),
    );
  // The issue may come back directly or wrapped; the CI alert reads the same three shapes.
  const body = JSON.parse(text) as {
    data?: {
      id?: string | number;
      identifier?: string;
      url?: string;
      issue?: { id?: string | number; identifier?: string; url?: string };
    };
  };
  const issue = body.data?.issue ?? body.data;
  if (issue?.id === undefined)
    throw new Error('NocoProject response has no issue id');
  return {
    id: String(issue.id),
    key: issue.identifier ?? null,
    url: issue.url ?? null,
  };
}

// The task only says which run to execute and where; the Check content stays in NocoQuality and is read
// through its API, and the long-lived execution guide lives in the NocoProject knowledge base.
// Wording avoids terms that make NocoProject ask for a proposal before executing.
export function runTaskRequest(input: {
  projectId: number;
  projectName: string;
  runId: number;
  runKey: string;
  total: number;
  deadlineAt: string;
  link: string;
}): DispatchRequest {
  const ids = input.projectId + ' ' + input.runId;
  return {
    title: 'NocoQuality 全量执行 ' + input.runKey,
    description: [
      'NocoQuality 已开始轮次 ' +
        input.runKey +
        '，请在执行机上逐条执行并回传结果。',
      '',
      '- 项目：' +
        input.projectName +
        '（项目 ID ' +
        input.projectId +
        '，轮次 ID ' +
        input.runId +
        '）',
      '- 本轮共 ' +
        input.total +
        ' 条检查，请在 ' +
        input.deadlineAt +
        ' 前完成',
      '- 执行说明：项目知识库 nocoquality-context 的“全量执行”一节',
      '- 查看本轮清单：`node ~/nocobase-quality/bin/run-plan.mjs ' + ids + '`',
      '- 每完成一条：`node ~/nocobase-quality/bin/report-result.mjs ' +
        ids +
        ' <结果文件>`',
      '- 全部完成：`node ~/nocobase-quality/bin/finish-run.mjs ' + ids + '`',
      '- 结果：' + input.link,
      '',
      '完成后在本任务只留一行：通过 x / 不通过 y，以及上面的结果链接。',
    ].join('\n'),
  };
}
