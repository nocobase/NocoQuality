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
export interface SourceSnapshot {
  source: 'tm3';
  sourceId: number;
  sourceUrl: string;
  importedAt: string;
  level: 'dimension' | 'feature';
  parentName: string | null;
  owner: string | null;
  status: string;
  skillsStatus: string;
  docsStatus: string;
  exampleExists: string;
  scores: Record<string, number | null>;
  notes: Record<string, string | null>;
}
export interface TestObject {
  sourceSnapshot?: SourceSnapshot | null;
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
  // Reviews the PR, or handles the not-passed result by hand.
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
  published: boolean;
  // Who decides the conclusion: a script, the executing Agent or a separate session; human means the Check is not
  // run and a person keeps its state for each object.
  judgeMode: JudgeMode;
  // The script a script-judged Check runs; empty for the other modes.
  command: string | null;
}
export type JudgeMode = 'script' | 'agent' | 'session' | 'human';
export type ManualStatus = 'unreviewed' | 'reviewed' | 'rereview';
// One change to the state of a human-judged Check on one object; the latest row is the current state.
export interface ManualState {
  id: number;
  projectId: number;
  checkId: number;
  objectId: number;
  status: ManualStatus;
  // Why it changed, often a link to the review record.
  note: string | null;
  createdBy: string;
  createdAt: string;
}
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
export type FixMode = 'pr' | 'assign';
export interface Run {
  id: number;
  projectId: number;
  key: string;
  status: string;
  executor: string | null;
  startedAt: string;
  finishedAt: string | null;
  environment: unknown;
  scope: unknown;
  steps: unknown;
  importedAt: string;
  importedBy: string | null;
  plan: PlanItem[] | null;
  deadlineAt: string | null;
  triggeredBy: string | null;
  externalTaskId: string | null;
  externalTaskKey: string | null;
  externalTaskUrl: string | null;
  dispatchError: string | null;
}
// One Check × object pair a started run must report, with the standard version it is judged by.
export interface PlanItem {
  checkId: number;
  objectId: number;
  standardId: number;
}
export interface Result {
  id: number;
  projectId: number;
  runId: number;
  checkId: number;
  standardId: number;
  objectId: number;
  conclusion: 'passed' | 'failed';
  note: string | null;
  evidence: string | null;
  evidencePath: string | null;
  prUrl: string | null;
  // History of the removed human review of results: confirmed when a person reviewed it, otherwise null.
  reviewStatus: 'confirmed' | null;
  reportedConclusion: 'passed' | 'failed' | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  reportedAt: string | null;
}
export interface WorkItem {
  id: number;
  projectId: number;
  // A to-do comes from a not-passed run result, or is filed by a person or Agent outside any run.
  source: 'run' | 'manual';
  runId: number | null;
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
  // review is kept by to-dos from the removed human review of results.
  kind: 'pr_review' | 'manual' | 'review';
  title: string;
  assigneeId: string;
  prUrl: string | null;
  status: 'open' | 'done';
  createdAt: string;
  doneAt: string | null;
  doneBy: string | null;
  // runId/resultId are where the to-do was first raised; a later failing run of the same Check × object updates these.
  lastRunId: number | null;
  lastResultId: number | null;
  occurrences: number;
  lastSeenAt: string | null;
}
