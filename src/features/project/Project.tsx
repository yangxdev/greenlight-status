import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  STAGES,
  type ProjectAction,
  type ProjectDetail,
  type ProjectEvent,
} from '../../../shared/api.ts';
import { useAppDispatch, useAppSelector } from '../../app/hooks.ts';
import { RichText } from '../../components/RichText.tsx';
import { ViewHeader } from '../../components/shell/index.ts';
import {
  Button,
  EmptyState,
  Note,
  Pane,
  Skeleton,
  StatusDot,
  TextArea,
  labelClass,
  linkClass,
} from '../../components/ui/index.ts';
import { formatUpdated } from '../../lib/format.ts';
import { messageOf } from '../../lib/api.ts';
import { describeProject, RUN_TONE, RUN_WORDS, STEP_TONE, STEP_WORDS } from '../board/board.ts';
import { StepBar } from '../board/StepBar.tsx';
import { tokensLabel, usageLine } from '../board/usage.ts';
import { selectMe } from '../session/sessionSlice.ts';
import { ChangeDrawer } from './ChangeDrawer.tsx';
import { addComment, fetchProject, runAction, selectProject } from './projectSlice.ts';

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

function When({ at }: { at: string }) {
  return (
    <time dateTime={at} className="font-mono text-note text-muted tnum">
      {formatUpdated(at)}
    </time>
  );
}

function EventBlock({ event }: { event: ProjectEvent }) {
  return (
    <div className="space-y-2">
      <RichText text={event.text} />
      <p className="flex flex-wrap gap-x-3 font-mono text-note text-muted">
        <When at={event.at} />
        {event.url ? (
          <a href={event.url} {...external} className={linkClass}>
            on GitHub
          </a>
        ) : null}
      </p>
    </div>
  );
}

/** The ten stages as ruled rows: status, when, and every report the stage posted on the issue. */
function Stages({ project }: { project: ProjectDetail }) {
  return (
    <ol>
      {STAGES.map(({ id, index, name }) => {
        const step = project.steps.find((s) => s.stage === id);
        const status = step?.status ?? 'pending';
        const events = project.events.filter((e) => e.stage === id);
        return (
          <li
            key={id}
            className="grid gap-x-6 gap-y-2 border-b border-line px-4 py-4 last:border-b-0 md:grid-cols-[9rem_minmax(0,1fr)]"
          >
            <div className="flex items-baseline gap-3 md:flex-col md:gap-1">
              <span className="font-mono text-label text-muted tnum">{index}</span>
              <span className="font-semibold text-ink">{name}</span>
            </div>
            <div className="min-w-0 space-y-3">
              <p className="flex items-center gap-2 text-small text-ink-soft">
                <StatusDot tone={STEP_TONE[status]} label={STEP_WORDS[status]} />
                <span aria-hidden="true">{STEP_WORDS[status]}</span>
                {step?.at && events.length === 0 ? <When at={step.at} /> : null}
              </p>
              {step?.usage ? (
                <p className="font-mono text-note text-muted tnum">{usageLine(step.usage)}</p>
              ) : null}
              {id === 'critic' && project.score ? (
                <p className="text-small text-ink-soft">
                  Scored{' '}
                  <a href={project.score.url} {...external} className={linkClass}>
                    {project.score.total}/20 on {project.score.date}
                  </a>
                </p>
              ) : null}
              {id === 'scout' && status === 'skipped' ? (
                <p className="text-small text-muted">
                  {project.kind === 'change'
                    ? 'A change starts at the Board: you asked for it, or the Observer did.'
                    : 'Written by hand, so the Scout, Analyst and Critic never saw it.'}
                </p>
              ) : null}
              {id === 'observer' && project.kind === 'change' ? (
                <p className="text-small text-muted">
                  A shipped change is watched in its product&rsquo;s weekly report.
                </p>
              ) : null}
              {id === 'observer' && project.verdict ? (
                <p className="text-small text-ink-soft">
                  Latest verdict:{' '}
                  <strong className="font-semibold text-ink">{project.verdict}</strong>
                  {project.reason ? `. ${project.reason}` : ''}
                </p>
              ) : null}
              {events.map((event, i) => (
                <EventBlock key={`${event.url}-${i}`} event={event} />
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** What the owner can do from here. One primary: the thing the project is waiting for. */
function Actions({ project }: { project: ProjectDetail }) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState<ProjectAction | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archived = project.states.includes('archived');

  const act = async (action: ProjectAction) => {
    setBusy(action);
    setError(null);
    try {
      await dispatch(runAction({ number: project.number, action })).unwrap();
      setConfirmArchive(false);
    } catch (e) {
      setError(messageOf(e, 'GitHub did not take it.'));
    } finally {
      setBusy(null);
    }
  };
  const button = (
    action: ProjectAction,
    label: string,
    variant: 'primary' | 'ghost' | 'danger',
  ) => (
    <Button size="sm" variant={variant} disabled={busy !== null} onClick={() => void act(action)}>
      {busy === action ? 'Sending…' : label}
    </Button>
  );

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-3">
        {project.attention === 'approve' ? button('approve', 'Approve', 'primary') : null}
        {project.attention === 'blueprint-ok' ? (
          <>
            {button('approve', 'Redo the blueprint', 'ghost')}
            {button('blueprint-ok', 'Start the build', 'primary')}
          </>
        ) : null}
        {project.attention === 'stuck' ? button('retry', 'Retry', 'primary') : null}
        {archived ? null : confirmArchive ? (
          <>
            <Button size="sm" onClick={() => setConfirmArchive(false)}>
              Keep it
            </Button>
            {button('archive', 'Archive and close', 'danger')}
          </>
        ) : (
          <Button size="sm" onClick={() => setConfirmArchive(true)}>
            Archive
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-note text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CommentForm({ number }: { number: number }) {
  const dispatch = useAppDispatch();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) {
      setError('Write something first.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await dispatch(addComment({ number, body })).unwrap();
      setBody('');
    } catch (e) {
      setError(messageOf(e, 'GitHub did not take it.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="space-y-3 border-t border-line p-4"
    >
      <TextArea
        label="Comment"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={error}
        hint="The Architect reads your comments the next time it runs on this idea."
      />
      <Button size="sm" type="submit" disabled={busy}>
        {busy ? 'Posting…' : 'Comment'}
      </Button>
    </form>
  );
}

/** An idea's changes, each linking to its own page; the owner asks for a new one here. */
function Changes({ project, owner }: { project: ProjectDetail; owner: boolean }) {
  const [drawer, setDrawer] = useState(false);
  const live = project.states.includes('live');
  return (
    <Pane label="Changes" aside={project.changes.length || undefined} flush>
      {project.changes.length > 0 ? (
        <ul>
          {project.changes.map((change) => {
            const tone =
              change.attention === 'stuck'
                ? 'danger'
                : change.attention
                  ? 'attention'
                  : change.closed
                    ? 'idle'
                    : 'active';
            const words = change.closed
              ? change.states.includes('shipped')
                ? 'Shipped'
                : 'Closed'
              : change.attention === 'stuck'
                ? 'Stuck'
                : change.attention
                  ? 'Waiting for you'
                  : 'In progress';
            return (
              <li
                key={change.number}
                className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0"
              >
                <Link to={`/p/${change.number}`} className={`${linkClass} min-w-0 text-small`}>
                  #{change.number} {change.name}
                </Link>
                <span className="flex shrink-0 items-center gap-2 font-mono text-note text-muted">
                  <StatusDot tone={tone} label={words} />
                  <span aria-hidden="true">{words}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="p-4 text-small text-muted">
          {live ? 'No changes yet.' : 'Changes can be asked for once the product is live.'}
        </p>
      )}
      {owner && live ? (
        <div className="border-t border-line p-4">
          <Button size="sm" onClick={() => setDrawer(true)}>
            Request a change
          </Button>
          <ChangeDrawer
            open={drawer}
            onClose={() => setDrawer(false)}
            parent={project.number}
            product={project.name}
          />
        </div>
      ) : null}
    </Pane>
  );
}

function ProjectView({ project, owner }: { project: ProjectDetail; owner: boolean }) {
  const { text, tone } = describeProject(project);
  const discussion = project.events.filter((e) => e.stage === null);
  const change = project.kind === 'change';
  const links = [
    { href: project.url, label: `issue #${project.number}` },
    project.productRepo
      ? { href: `https://github.com/${project.productRepo}`, label: 'repo' }
      : null,
    project.blueprintUrl
      ? { href: project.blueprintUrl, label: change ? 'change spec' : 'blueprint' }
      : null,
    project.liveUrl ? { href: project.liveUrl, label: 'live site' } : null,
  ].filter((l) => l !== null);

  return (
    <>
      <ViewHeader
        eyebrow={
          <>
            <Link to="/" className={linkClass}>
              Pipeline
            </Link>{' '}
            {change && project.parent ? (
              <>
                /{' '}
                <Link to={`/p/${project.parent}`} className={linkClass}>
                  #{project.parent}
                </Link>{' '}
                / change #{project.number}
              </>
            ) : (
              <>/ #{project.number}</>
            )}
          </>
        }
        title={project.name}
        meta={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-2 text-ink-soft">
              <StatusDot tone={tone} label={text} />
              <span aria-hidden="true">{text}</span>
            </span>
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                {...external}
                className={`${linkClass} font-mono text-note`}
              >
                {l.label}
                <span aria-hidden="true"> ↗</span>
              </a>
            ))}
          </span>
        }
        actions={owner ? <Actions project={project} /> : undefined}
      />

      <div className="px-edge pt-6">
        <StepBar steps={project.steps} />
      </div>

      <div className="grid items-start gap-6 px-edge py-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Pane
            label="Stages"
            aside={
              project.usage ? (
                <span className="font-mono tnum">{tokensLabel(project.usage)}</span>
              ) : undefined
            }
            flush
          >
            <Stages project={project} />
          </Pane>
          {project.usage ? (
            <Note>
              Tokens are what each Claude run reported: fresh input, cache reads and writes, and
              output. Runs from before usage was recorded aren&rsquo;t counted. The API price is
              what the same tokens would cost on the API; a subscription doesn&rsquo;t bill it.
            </Note>
          ) : null}
        </div>

        <div className="space-y-6">
          {change ? null : <Changes project={project} owner={owner} />}

          <Pane label={change ? 'Request' : 'Idea'}>
            {project.body.length > 0 ? (
              <dl className="space-y-5">
                {project.body.map((section) => (
                  <div key={section.heading}>
                    <dt className={labelClass}>{section.heading}</dt>
                    <dd className="mt-2">
                      <RichText text={section.text} />
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-small text-muted">The issue has no description.</p>
            )}
          </Pane>

          {project.productRepo ? (
            <Pane label="Builds" aside={project.productRepo} flush>
              {project.pulls.length === 0 && project.productRuns.length === 0 ? (
                <p className="p-4 text-small text-muted">No pull requests or runs yet.</p>
              ) : (
                <ul>
                  {project.pulls.map((pull) => (
                    <li
                      key={`pr-${pull.number}`}
                      className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-3"
                    >
                      <a
                        href={pull.url}
                        {...external}
                        className={`${linkClass} min-w-0 text-small`}
                      >
                        #{pull.number} {pull.title}
                      </a>
                      <span className="shrink-0 font-mono text-note text-muted uppercase">
                        {pull.draft ? 'draft' : pull.state}
                      </span>
                    </li>
                  ))}
                  {project.productRuns.map((run) => (
                    <li
                      key={run.url}
                      className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0"
                    >
                      <a href={run.url} {...external} className={`${linkClass} min-w-0 text-small`}>
                        {run.title}
                      </a>
                      <span className="flex shrink-0 items-center gap-2 font-mono text-note text-muted">
                        <StatusDot tone={RUN_TONE[run.status]} label={RUN_WORDS[run.status]} />
                        <When at={run.at} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Pane>
          ) : null}

          <Pane label="Discussion" aside={discussion.length || undefined} flush>
            {discussion.length > 0 ? (
              <ul>
                {discussion.map((event, i) => (
                  <li
                    key={`${event.url}-${i}`}
                    className="space-y-2 border-b border-line p-4 last:border-b-0"
                  >
                    <p className="font-mono text-note text-ink-soft">{event.author}</p>
                    <EventBlock event={event} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-small text-muted">No comments besides the stages’ reports.</p>
            )}
            {owner ? <CommentForm number={project.number} /> : null}
          </Pane>
        </div>
      </div>
    </>
  );
}

export default function Project() {
  const dispatch = useAppDispatch();
  const number = Number(useParams().number);
  const entry = useAppSelector((state) => selectProject(state, number));
  const me = useAppSelector(selectMe);
  const valid = Number.isInteger(number) && number > 0;

  useEffect(() => {
    if (valid) void dispatch(fetchProject(number));
  }, [dispatch, number, valid]);

  if (entry?.data) return <ProjectView project={entry.data} owner={me.owner} />;

  if (!valid || entry?.status === 'error') {
    return (
      <div role="alert" className="px-edge py-6">
        <EmptyState
          title="Could not open this project"
          body={valid ? (entry?.error ?? 'Something went wrong.') : 'That is not a project number.'}
          action={
            valid ? (
              <Button onClick={() => void dispatch(fetchProject(number))}>Try again</Button>
            ) : (
              <Link to="/" className={linkClass}>
                Back to the pipeline
              </Link>
            )
          }
        />
        <Note className="mt-4">Only idea issues are projects.</Note>
      </div>
    );
  }

  return (
    <div role="status" aria-label="Loading" className="space-y-6 px-edge py-6">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-1.5 w-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Skeleton className="h-96" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
