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
}
export interface Task {
  id: number;
  projectId: number;
  checkId: number;
  // The object this run checked; for a shared Check it selects one inheriting object.
  objectId: number | null;
  standardId: number;
  revision: string;
  environment: string;
  executionStatus: string;
  conclusion: string;
  evidence: string;
  requestKey: string;
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
  kind: 'pr_review' | 'manual';
  title: string;
  assigneeId: string;
  prUrl: string | null;
  status: 'open' | 'done';
  createdAt: string;
  doneAt: string | null;
  doneBy: string | null;
}
