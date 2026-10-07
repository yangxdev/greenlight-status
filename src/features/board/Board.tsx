import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { StatusResponse } from '../../../shared/api.ts';
import { useAppSelector } from '../../app/hooks.ts';
import { ViewHeader } from '../../components/shell/index.ts';
import { Button, EmptyState, Note, Segmented, inputClass } from '../../components/ui/index.ts';
import { cn } from '../../lib/cn.ts';
import { NewIdeaDrawer } from '../ideas/NewIdeaDrawer.tsx';
import { QuickNoteDrawer } from '../ideas/QuickNoteDrawer.tsx';
import { selectMe } from '../session/sessionSlice.ts';
import { StaleNote, StatusGate, Updated } from '../status/StatusGate.tsx';
import {
  FILTER_LABELS,
  FILTERS,
  matchesFilter,
  matchesQuery,
  sortProjects,
  waitingByStage,
  type Filter,
} from './board.ts';
import { ProjectTile } from './ProjectTile.tsx';
import { StageStrip } from './StageStrip.tsx';

const SIGN_IN_NOTES: Record<string, string> = {
  denied: 'Only the pipeline’s owner can sign in. Everything here stays readable.',
  failed: 'GitHub sign-in did not finish. Try again.',
};

function BoardView({
  data,
  onNewIdea,
  onQuickNote,
}: {
  data: StatusResponse;
  onNewIdea?: () => void;
  onQuickNote?: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');
  const [params] = useSearchParams();
  const signInNote = SIGN_IN_NOTES[params.get('signin') ?? ''];

  const sorted = useMemo(() => sortProjects(data.projects), [data.projects]);
  const shown = sorted.filter((p) => matchesFilter(p, filter) && matchesQuery(p, query));
  const needsYou = data.projects.filter((p) => matchesFilter(p, 'needs-you')).length;
  // Gates waiting, on ideas and on their changes alike.
  const waiting = useMemo(() => waitingByStage(data.projects), [data.projects]);

  return (
    <>
      <ViewHeader
        title="Pipeline"
        meta={
          <span className="tnum">
            {data.projects.length} {data.projects.length === 1 ? 'project' : 'projects'}
            {needsYou > 0 ? (
              <>
                {' · '}
                <span className="text-brand">{needsYou} need you</span>
              </>
            ) : null}
            {' · '}
            <Updated data={data} />
          </span>
        }
        actions={
          onNewIdea ? (
            <>
              {onQuickNote ? (
                <Button variant="ghost" size="sm" onClick={onQuickNote}>
                  Quick note
                </Button>
              ) : null}
              <Button variant="primary" size="sm" onClick={onNewIdea}>
                New idea
              </Button>
            </>
          ) : undefined
        }
      />
      <StaleNote data={data} />
      {signInNote ? <Note className="px-edge pt-4">{signInNote}</Note> : null}

      <div className="space-y-8 px-edge py-6">
        <section aria-labelledby="stages-heading" className="space-y-3">
          <h2 id="stages-heading" className="font-mono text-label uppercase text-muted">
            Stages
          </h2>
          <StageStrip stages={data.stages} now={data.fetchedAt} waiting={waiting} />
        </section>

        <section aria-labelledby="projects-heading" className="space-y-4">
          <h2 id="projects-heading" className="font-mono text-label uppercase text-muted">
            Projects
          </h2>
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <Segmented
              label="Filter projects"
              options={FILTERS.map((value) => ({
                value,
                label: FILTER_LABELS[value],
                count: data.projects.filter((p) => matchesFilter(p, value)).length,
              }))}
              value={filter}
              onChange={setFilter}
            />
            <input
              type="search"
              aria-label="Search projects"
              placeholder="Search by name or #"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={cn(inputClass, 'w-full py-1.5 text-small sm:w-64')}
            />
          </div>
          {shown.length > 0 ? (
            <ul className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {shown.map((project) => (
                <ProjectTile key={project.number} project={project} now={data.fetchedAt} />
              ))}
            </ul>
          ) : data.projects.length === 0 ? (
            <EmptyState
              title="No ideas yet"
              body="Ideas appear here when the Critic files one, or when you write one."
              action={onNewIdea ? <Button onClick={onNewIdea}>Write an idea</Button> : undefined}
            />
          ) : (
            <EmptyState
              title="Nothing matches"
              body="No project fits this filter and search."
              action={
                <Button
                  onClick={() => {
                    setFilter('active');
                    setQuery('');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          )}
          <Note>Only the 100 newest issues are read.</Note>
        </section>
      </div>
    </>
  );
}

export default function Board() {
  const me = useAppSelector(selectMe);
  const [drawer, setDrawer] = useState(false);
  const [noteDrawer, setNoteDrawer] = useState(false);
  return (
    <>
      <StatusGate>
        {(data) => (
          <BoardView
            data={data}
            onNewIdea={me.owner ? () => setDrawer(true) : undefined}
            onQuickNote={me.owner ? () => setNoteDrawer(true) : undefined}
          />
        )}
      </StatusGate>
      {me.owner ? (
        <>
          <NewIdeaDrawer open={drawer} onClose={() => setDrawer(false)} />
          <QuickNoteDrawer open={noteDrawer} onClose={() => setNoteDrawer(false)} />
        </>
      ) : null}
    </>
  );
}
