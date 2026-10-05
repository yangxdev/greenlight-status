import {
  STAGES,
  type PipelineStage,
  type ProjectEvent,
  type RunStatus,
  type StageRun,
} from '../../shared/api.ts';
import { eventStatus } from './project.ts';

export const RUNS_PER_STAGE = 8;

export interface WorkflowRun extends StageRun {
  /** The workflow file name, e.g. "scout.yml". */
  workflow: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function runStatus(status: unknown, conclusion: unknown): RunStatus | null {
  if (status === 'in_progress') return 'running';
  if (status !== 'completed') return 'queued';
  switch (conclusion) {
    case 'success':
    case 'neutral':
      return 'success';
    case 'cancelled':
      return 'cancelled';
    // A label the workflow ignores still starts a run that skips its jobs: noise, not activity.
    case 'skipped':
      return null;
    default:
      return 'failure';
  }
}

/** `GET /repos/:repo/actions/runs`, newest first. Skipped runs and malformed entries drop themselves. */
export function parseWorkflowRuns(json: unknown): WorkflowRun[] {
  const list = isRecord(json) && Array.isArray(json.workflow_runs) ? json.workflow_runs : [];
  const out: WorkflowRun[] = [];
  for (const item of list as unknown[]) {
    if (!isRecord(item)) continue;
    const { path, html_url: url, created_at: at, display_title: title, name } = item;
    if (typeof path !== 'string' || typeof url !== 'string' || typeof at !== 'string') continue;
    const status = runStatus(item.status, item.conclusion);
    if (!status) continue;
    out.push({
      workflow: path.split('@')[0]?.split('/').pop() ?? path,
      at,
      status,
      title: typeof title === 'string' ? title : typeof name === 'string' ? name : '',
      url,
    });
  }
  return out;
}

/**
 * The ten stages as the strip shows them. Stages with a workflow in the pipeline repo take its runs; the Factory,
 * Inspector and Publisher run in each product's repo, so their activity is their comments on the idea issues.
 */
export function buildStages(
  runs: WorkflowRun[],
  events: { project: { number: number; name: string }; event: ProjectEvent }[],
  repo: string,
): PipelineStage[] {
  return STAGES.map(({ id, workflow }) => {
    if (workflow) {
      return {
        id,
        workflowUrl: `https://github.com/${repo}/actions/workflows/${workflow}`,
        runs: runs
          .filter((r) => r.workflow === workflow)
          .slice(0, RUNS_PER_STAGE)
          .map(({ at, status, title, url }) => ({ at, status, title, url })),
      };
    }
    return {
      id,
      workflowUrl: null,
      runs: events
        .filter(({ event }) => event.stage === id)
        .sort((a, b) => (a.event.at < b.event.at ? 1 : -1))
        .slice(0, RUNS_PER_STAGE)
        .map(({ project, event }) => ({
          at: event.at,
          status: eventStatus(event.text),
          title: `#${project.number} ${project.name}`,
          url: event.url,
        })),
    };
  });
}
