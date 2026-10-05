import type { ProjectStep } from '../../../shared/api.ts';
import { cn } from '../../lib/cn.ts';
import { stageName, STEP_WORDS } from './board.ts';

const FILL: Record<ProjectStep['status'], string> = {
  done: 'bg-ink',
  running: 'bg-ink-soft animate-pulse',
  waiting: 'bg-brand',
  stuck: 'bg-danger',
  skipped: 'bg-line',
  pending: 'bg-line',
};

/** Ten segments, one per stage: how far a project got. The accent marks a gate waiting for you. */
export function StepBar({ steps }: { steps: readonly ProjectStep[] }) {
  const reached = steps.filter((s) => s.status === 'done').length;
  return (
    <ol
      aria-label={`${reached} of ${steps.length} stages done`}
      className="grid grid-cols-10 gap-0.5"
    >
      {steps.map((step) => (
        <li
          key={step.stage}
          title={`${stageName(step.stage)}: ${STEP_WORDS[step.status]}`}
          className={cn('h-1.5', FILL[step.status])}
        >
          <span className="sr-only">
            {stageName(step.stage)}: {STEP_WORDS[step.status]}
          </span>
        </li>
      ))}
    </ol>
  );
}
