import { describe, expect, it } from 'vitest';
import type { IdeaState, ProjectEvent, StageId, StepStatus } from '../../shared/api.ts';
import {
  cleanText,
  commentEvents,
  deriveSteps,
  eventStatus,
  lastMarker,
  parseComments,
  type IssueComment,
} from './project.ts';

const comment = (body: string, overrides: Partial<IssueComment> = {}): IssueComment => ({
  issue: 1,
  at: '2026-10-01T00:00:00Z',
  author: 'github-actions[bot]',
  trusted: true,
  body,
  url: 'https://github.com/c',
  ...overrides,
});

const event = (stage: StageId, text: string, at = '2026-10-01T00:00:00Z'): ProjectEvent => ({
  stage,
  text,
  at,
  author: 'github-actions[bot]',
  url: 'https://github.com/c',
});

const statuses = (states: IdeaState[], events: ProjectEvent[] = [], author = 'yangxdev') => {
  const { steps, current, attention } = deriveSteps(
    { states, author, createdAt: '2026-09-30T00:00:00Z' },
    events,
  );
  return {
    by: Object.fromEntries(steps.map((s) => [s.stage, s.status])) as Record<StageId, StepStatus>,
    current,
    attention,
  };
};

describe('parseComments', () => {
  it('trusts the workflow bot and people with write access, nobody else', () => {
    const [bot, owner, stranger] = parseComments([
      {
        body: 'a',
        created_at: 't',
        user: { login: 'github-actions[bot]' },
        issue_url: 'x/issues/4',
      },
      { body: 'b', created_at: 't', user: { login: 'yangxdev' }, author_association: 'OWNER' },
      { body: 'c', created_at: 't', user: { login: 'someone' }, author_association: 'NONE' },
      'junk',
    ]);
    expect(bot).toMatchObject({ trusted: true, issue: 4 });
    expect(owner?.trusted).toBe(true);
    expect(stranger?.trusted).toBe(false);
  });
});

describe('commentEvents', () => {
  it("splits the Architect's comment at the Reviewer's marker, and strips emoji and markers", () => {
    const events = commentEvents(
      comment(
        '📐 **Architect:** blueprint ready.\n\n- Task 1\n\n🔎 **Reviewer:** ready.\n\n<!-- greenlight:repo=a/b -->',
      ),
    );
    expect(events.map((e) => e.stage)).toEqual(['architect', 'reviewer']);
    expect(events[0]?.text).toBe('**Architect:** blueprint ready.\n\n- Task 1');
    expect(events[1]?.text).toBe('**Reviewer:** ready.');
  });

  it('maps Factory variants and the weekly Observer to their stages', () => {
    expect(commentEvents(comment('**Factory (fix):** run failed'))[0]?.stage).toBe('factory');
    expect(commentEvents(comment('**Factory dispatch:** build started'))[0]?.stage).toBe('factory');
    expect(commentEvents(comment('**Observer, 2026-W40:** fine'))[0]?.stage).toBe('observer');
  });

  it('treats an untrusted comment with a marker as discussion', () => {
    const [e] = commentEvents(comment('**Publisher:** live!', { trusted: false }));
    expect(e?.stage).toBeNull();
  });
});

describe('eventStatus and cleanText', () => {
  it('reads failures, a busy slot and successes from the wording', () => {
    expect(eventStatus('**Inspector:** failed 3 fix rounds and needs a human.')).toBe('failure');
    expect(eventStatus('**Factory dispatch:** another build is in progress (#3).')).toBe(
      'cancelled',
    );
    expect(eventStatus('**Inspector:** passed and merged')).toBe('success');
  });

  it('keeps text, drops HTML comments and emoji', () => {
    expect(cleanText('🚀 hi <!-- x -->\n\n\n\nthere ')).toBe('hi\n\nthere');
  });
});

describe('lastMarker', () => {
  it('takes the last marker from trusted comments only', () => {
    const comments = [
      comment('<!-- greenlight:repo=a/one -->'),
      comment('<!-- greenlight:repo=a/two -->'),
      comment('<!-- greenlight:repo=evil/repo -->', { trusted: false }),
      comment('<!-- greenlight:url=javascript:alert(1) -->'),
    ];
    expect(lastMarker(comments, 'repo')).toBe('a/two');
    expect(lastMarker(comments, 'url')).toBeNull();
    expect(lastMarker([comment('<!-- greenlight:url=https://x.workers.dev -->')], 'url')).toBe(
      'https://x.workers.dev',
    );
  });
});

describe('deriveSteps', () => {
  it('a new hand-written idea waits for approval at the Board', () => {
    const { by, current, attention } = statuses(['idea']);
    expect(by.scout).toBe('skipped');
    expect(by.board).toBe('waiting');
    expect(by.architect).toBe('pending');
    expect(current).toBe('board');
    expect(attention).toBe('approve');
  });

  it('a Critic-filed idea has done the first three stages', () => {
    const { by } = statuses(['idea'], [], 'github-actions[bot]');
    expect([by.scout, by.analyst, by.critic]).toEqual(['done', 'done', 'done']);
  });

  it('approved: the Architect is running', () => {
    const { by, current, attention } = statuses(['approved']);
    expect(by.board).toBe('done');
    expect(by.architect).toBe('running');
    expect(current).toBe('architect');
    expect(attention).toBeNull();
  });

  it('blueprint-ready: the Reviewer is done and the owner is needed', () => {
    const { by, attention } = statuses(
      ['blueprint-ready'],
      [event('architect', 'ready'), event('reviewer', 'ready')],
    );
    expect(by.architect).toBe('done');
    expect(by.reviewer).toBe('waiting');
    expect(attention).toBe('blueprint-ok');
  });

  it('building: the Inspector is up once the Factory opened a PR after its last word', () => {
    expect(
      statuses(['building'], [event('factory', '**Factory dispatch:** build started')]).current,
    ).toBe('factory');
    const reviewing = statuses(
      ['building'],
      [
        event('factory', '**Factory dispatch:** build started', '2026-10-01T01:00:00Z'),
        event('factory', '**Factory:** PR opened: x', '2026-10-01T02:00:00Z'),
      ],
    );
    expect(reviewing.current).toBe('inspector');
    expect(reviewing.by.factory).toBe('done');
    expect(reviewing.by.inspector).toBe('running');
  });

  it('stuck: the newest stage that reported is the one that gave up', () => {
    const { by, current, attention } = statuses(
      ['stuck'],
      [
        event('factory', '**Factory:** PR opened', '2026-10-01T01:00:00Z'),
        event('inspector', '**Inspector:** failed 3 fix rounds', '2026-10-01T02:00:00Z'),
      ],
    );
    expect(by.inspector).toBe('stuck');
    expect(by.publisher).toBe('pending');
    expect(current).toBe('inspector');
    expect(attention).toBe('stuck');
  });

  it('a failure that was later fixed does not show as stuck', () => {
    const { by } = statuses(
      ['live'],
      [event('publisher', '**Publisher:** deploy or smoke test failed.', '2026-10-01T01:00:00Z')],
    );
    expect(by.publisher).toBe('done');
  });

  it('live: everything up to the Publisher is done even without comments, the Observer watches', () => {
    const { by, current } = statuses(['live']);
    expect([by.architect, by.factory, by.inspector, by.publisher]).toEqual([
      'done',
      'done',
      'done',
      'done',
    ]);
    expect(by.observer).toBe('running');
    expect(current).toBe('observer');
  });

  it('a re-approved live project starts over at the Architect', () => {
    const { by } = statuses(['approved'], [event('publisher', '**Publisher:** live')]);
    expect(by.architect).toBe('running');
    expect(by.publisher).toBe('pending');
  });
});
