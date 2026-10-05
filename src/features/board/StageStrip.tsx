import { useState } from 'react';
import { STAGES, type PipelineStage, type StageId } from '../../../shared/api.ts';
import {
  Drawer,
  EmptyState,
  Note,
  RuledItem,
  RuledList,
  StatusDot,
  buttonClass,
  labelClass,
  linkClass,
} from '../../components/ui/index.ts';
import { ago, formatUpdated } from '../../lib/format.ts';
import { RUN_TONE, RUN_WORDS, STAGE_ABOUT, stageName } from './board.ts';

/** The pipeline from above: ten numbered cells, each with its last run. A cell opens that stage's recent runs. */
export function StageStrip({
  stages,
  now,
  waiting,
}: {
  stages: readonly PipelineStage[];
  now: string;
  /** How many projects wait for you at the stage with the gate: the Board (approve) and the Reviewer (build). */
  waiting: Partial<Record<StageId, number>>;
}) {
  const [open, setOpen] = useState<StageId | null>(null);
  const selected = stages.find((s) => s.id === open) ?? null;

  return (
    <>
      <ol
        aria-label="Pipeline stages"
        className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-5 xl:grid-cols-10"
      >
        {STAGES.map(({ id, index, name }) => {
          const stage = stages.find((s) => s.id === id);
          const last = stage?.runs[0];
          const count = waiting[id] ?? 0;
          return (
            <li key={id} className="bg-canvas">
              <button
                type="button"
                onClick={() => setOpen(id)}
                className="flex h-full w-full cursor-pointer flex-col gap-2 p-3.5 text-left transition-colors duration-(--duration-hover) ease-out-soft hover:bg-zone pointer-coarse:p-4"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-label text-muted tnum">{index}</span>
                  {last ? (
                    <StatusDot tone={RUN_TONE[last.status]} label={RUN_WORDS[last.status]} />
                  ) : (
                    <StatusDot tone="idle" label="No runs yet" />
                  )}
                </span>
                <span className="font-semibold text-ink">{name}</span>
                <span className="font-mono text-note text-muted tnum">
                  {last ? <time dateTime={last.at}>{ago(last.at, now)}</time> : 'no runs yet'}
                </span>
                {count > 0 ? (
                  <span className="font-mono text-note text-brand tnum">{count} need you</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>

      <Drawer
        open={selected !== null}
        onClose={() => setOpen(null)}
        eyebrow={selected ? STAGES.find((s) => s.id === selected.id)?.index : undefined}
        title={selected ? stageName(selected.id) : ''}
        footer={
          selected?.workflowUrl ? (
            <a
              href={selected.workflowUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass('ghost', 'sm')}
            >
              All runs on GitHub
            </a>
          ) : undefined
        }
      >
        {selected ? (
          <div className="space-y-6">
            <p className="text-small text-ink-soft">{STAGE_ABOUT[selected.id]}</p>
            {selected.runs.length > 0 ? (
              <div>
                <h3 className={labelClass}>Recent</h3>
                <RuledList className="mt-3">
                  {selected.runs.map((run) => (
                    <RuledItem
                      key={run.url + run.at}
                      className="py-3 sm:py-3 md:grid-cols-[minmax(0,1fr)_auto]"
                      aside={
                        <span className="flex items-center gap-2 font-mono text-note text-muted">
                          <StatusDot tone={RUN_TONE[run.status]} label={RUN_WORDS[run.status]} />
                          <span aria-hidden="true">{RUN_WORDS[run.status]}</span>
                        </span>
                      }
                    >
                      <a
                        href={run.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${linkClass} text-small`}
                      >
                        {run.title || 'Run'}
                      </a>
                      <p className="mt-1 font-mono text-note text-muted tnum">
                        <time dateTime={run.at}>{formatUpdated(run.at)}</time>
                      </p>
                    </RuledItem>
                  ))}
                </RuledList>
              </div>
            ) : (
              <EmptyState
                title="No runs yet"
                body="Runs show here once this stage has worked on something."
              />
            )}
            {selected.workflowUrl ? null : (
              <Note>
                This stage runs in each product's own repository; these are its reports on the idea
                issues.
              </Note>
            )}
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
