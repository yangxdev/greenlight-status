import { Link } from 'react-router';
import type { ProjectSummary } from '../../../shared/api.ts';
import { StatusDot, labelClass } from '../../components/ui/index.ts';
import { ago } from '../../lib/format.ts';
import { describeProject } from './board.ts';
import { StepBar } from './StepBar.tsx';

/** One project in the grid: number and state, name, the ten-stage bar, and what it is doing now. */
export function ProjectTile({ project, now }: { project: ProjectSummary; now: string }) {
  const { text, tone } = describeProject(project);
  return (
    <li className="bg-canvas">
      <Link
        to={`/p/${project.number}`}
        className="group flex h-full flex-col gap-4 p-5 transition-colors duration-(--duration-hover) ease-out-soft hover:bg-zone"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className={`${labelClass} tnum`}>
            #{project.number} · {project.states.join(' + ')}
          </span>
          {project.score ? (
            <span className={`${labelClass} tnum`}>{project.score.total}/20</span>
          ) : null}
        </div>
        <h2 className="text-h3 font-semibold break-words text-ink group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">
          {project.name}
        </h2>
        <div className="mt-auto space-y-3">
          <StepBar steps={project.steps} />
          <div className="flex items-center justify-between gap-3 text-small">
            <span className="flex min-w-0 items-center gap-2 text-ink-soft">
              <StatusDot tone={tone} label={text} />
              <span className="truncate" aria-hidden="true">
                {text}
              </span>
            </span>
            <time dateTime={project.updatedAt} className="shrink-0 font-mono text-note text-muted">
              {ago(project.updatedAt, now)}
            </time>
          </div>
        </div>
      </Link>
    </li>
  );
}
