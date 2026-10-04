export interface Project {
  id: number;
  key: string;
  name: string;
  type: string;
  description: string;
  active: boolean;
}
export interface Dimension {
  id: number;
  projectId: number;
  key: string;
  name: string;
  position: number;
  active: boolean;
}
export interface TestObject {
  id: number;
  projectId: number;
  key: string;
  name: string;
  category: string;
  description: string;
  active: boolean;
  // Left out of full runs while the feature is still being developed; definitions and history stay.
  testingPaused: boolean;
  pausedReason: string | null;
  // Skills, packages and documentation pages that belong to the object.
  materials: Material[] | null;
}
export type MaterialType = 'skill' | 'package' | 'doc' | 'other';
export interface Material {
  type: MaterialType;
  ref: string;
}
export type CheckScope = 'object' | 'shared';
export interface Check {
  id: number;
  projectId: number;
  // Empty for a shared Check, which every object of its dimension inherits.
  objectId: number | null;
  scope: CheckScope;
  dimensionId: number;
  key: string;
  name: string;
  active: boolean;
  fixMode: FixMode;
  assigneeId: string | null;
  // The problem, PR or report this Check guards against.
  source: string | null;
}
export interface Standard {
  id: number;
  checkId: number;
  version: number;
  definition: string;
  preconditions: string;
  steps: string;
  passCriteria: string;
  evidence: string;
  humanReview: boolean;
  published: boolean;
  judgeMode: JudgeMode;
  command: string | null;
}
// Who decides a Check's conclusion: a script, the executing Agent, a separate session, or a person.
export type JudgeMode = 'script' | 'agent' | 'session' | 'human';
// An object that turned off one shared Check; absence means the Check applies.
export interface CheckExclusion {
  id: number;
  projectId: number;
  checkId: number;
  objectId: number;
  reason: string | null;
  createdAt: string;
}
export interface Applicability {
  id: number;
  projectId: number;
  objectId: number;
  dimensionId: number;
}
export interface Detail {
  project: Project;
  dimensions: Dimension[];
  objects: TestObject[];
  checks: Check[];
  standards: Standard[];
  applicability: Applicability[];
  exclusions: CheckExclusion[];
}
export type FixMode = 'pr' | 'assign';
export interface RunStep {
  at: string;
  action: string;
  note?: string;
  status?: string;
  error?: string;
  decision?: string;
}
export interface RunEnvironmentRepo {
  repo: string;
  commit: string;
  committedAt: string;
  lastSyncedAt?: string;
  pulledThisRun?: boolean;
}
export interface Run {
  id: number;
  projectId: number;
  key: string;
  status: string;
  executor: string | null;
  startedAt: string;
  finishedAt: string | null;
  environment: {
    code?: RunEnvironmentRepo | null;
    codePro?: RunEnvironmentRepo | null;
  } | null;
  steps?: RunStep[] | null;
  importedAt: string;
  // Started runs know their Check × object pairs; imported runs have none.
  plan?: PlanItem[] | null;
  deadlineAt?: string | null;
  triggeredBy?: string | null;
  externalTaskId?: string | null;
  externalTaskKey?: string | null;
  externalTaskUrl?: string | null;
  dispatchError?: string | null;
  // running, completed, or overdue for a running run past its deadline.
  displayStatus: string;
}
export interface PlanItem {
  checkId: number;
  objectId: number;
  standardId: number;
}
export interface RunSummary extends Run {
  expected: number;
  pendingReview: number;
  passed: number;
  failed: number;
  openItems: number;
  prs: number;
}
export interface Result {
  id: number;
  runId: number;
  checkId: number;
  standardId: number;
  objectId: number;
  conclusion: 'passed' | 'failed';
  note: string | null;
  evidence: string | null;
  evidencePath: string | null;
  prUrl: string | null;
  reviewStatus?: 'pending' | 'confirmed' | null;
  reportedConclusion?: 'passed' | 'failed' | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
}
export interface WorkItem {
  id: number;
  source: 'run' | 'manual';
  runId: number | null;
  runKey?: string;
  resultId: number | null;
  checkId: number | null;
  objectId: number | null;
  problem: string | null;
  scenario: string | null;
  actualExpected: string | null;
  evidence: string | null;
  impact: string | null;
  handling: string | null;
  prState: 'open' | 'merged' | 'closed' | null;
  prSyncedAt: string | null;
  createdBy: string | null;
  kind: 'pr_review' | 'manual' | 'review';
  title: string;
  assigneeId: string;
  prUrl: string | null;
  status: 'open' | 'done';
  createdAt: string;
  doneAt: string | null;
  doneBy: string | null;
}
export interface RunDetail {
  run: Run;
  results: Result[];
  workItems: WorkItem[];
}
export interface QualityUser {
  id: string;
  name: string;
}
export interface WorkItemDetail {
  item: WorkItem;
  result: Result | null;
  run: Pick<Run, 'id' | 'key' | 'environment' | 'startedAt'> | null;
}
