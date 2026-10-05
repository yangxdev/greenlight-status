import { describe, expect, it } from 'vitest';
import type { ProjectSummary } from '../../../shared/api.ts';
import { makeProject, makeSteps } from '../../test/status.ts';
import { describeProject, matchesFilter, matchesQuery, sortProjects } from './board.ts';

describe('describeProject', () => {
  it('says what the project waits for, with the accent only where you are needed', () => {
    expect(describeProject(makeProject())).toEqual({
      text: 'Waiting for you: approve',
      tone: 'attention',
    });
    expect(
      describeProject(makeProject({ attention: 'stuck', current: 'inspector', states: ['stuck'] })),
    ).toEqual({ text: 'Stuck at Inspector', tone: 'danger' });
    expect(
      describeProject(
        makeProject({ attention: null, states: ['live'], verdict: 'keep', current: 'observer' }),
      ),
    ).toEqual({ text: 'Live · keep', tone: 'success' });
    expect(
      describeProject(
        makeProject({
          attention: null,
          states: ['building'],
          current: 'factory',
          steps: makeSteps(6, 'running'),
        }),
      ),
    ).toEqual({ text: 'Factory running', tone: 'active' });
  });
});

describe('filters, search and order', () => {
  const live = makeProject({ number: 1, name: 'opt-out-log', attention: null, states: ['live'] });
  const waiting = makeProject({ number: 2, name: 'glossary' });
  const building = makeProject({ number: 3, attention: null, states: ['building'] });
  const gone = makeProject({ number: 4, attention: null, states: ['archived'] });

  it('sorts each project into its filters', () => {
    const all = [live, waiting, building, gone];
    const pick = (f: Parameters<typeof matchesFilter>[1]) =>
      all.filter((p) => matchesFilter(p, f)).map((p) => p.number);
    expect(pick('active')).toEqual([1, 2, 3]);
    expect(pick('needs-you')).toEqual([2]);
    expect(pick('building')).toEqual([3]);
    expect(pick('live')).toEqual([1]);
    expect(pick('archived')).toEqual([4]);
  });

  it('searches by name or issue number', () => {
    expect(matchesQuery(live, 'OPT')).toBe(true);
    expect(matchesQuery(live, '#1')).toBe(true);
    expect(matchesQuery(live, 'gloss')).toBe(false);
  });

  it('puts stuck projects first, then the gates, then the most recently updated', () => {
    const stuck = makeProject({ number: 9, attention: 'stuck', updatedAt: '2026-01-01T00:00:00Z' });
    const fresh = makeProject({ number: 8, attention: null, updatedAt: '2026-10-05T00:00:00Z' });
    const old = makeProject({ number: 7, attention: null, updatedAt: '2026-09-01T00:00:00Z' });
    expect(sortProjects([old, fresh, waiting, stuck]).map((p) => p.number)).toEqual([9, 2, 8, 7]);
  });
});

describe('changes on the board', () => {
  const change = (
    n: number,
    attention: 'approve' | 'blueprint-ok' | 'stuck' | null,
    closed = false,
  ) => ({
    number: n,
    name: `c${n}`,
    url: '',
    states: [closed ? 'shipped' : 'idea'] as ProjectSummary['states'],
    closed,
    current: 'board' as const,
    attention,
    updatedAt: '',
  });
  const live = makeProject({ number: 1, attention: null, states: ['live'], current: 'observer' });

  it('a change waiting for you puts its product under "Needs you", with the accent', () => {
    const p = { ...live, changes: [change(12, 'blueprint-ok')] };
    expect(describeProject(p)).toEqual({
      text: 'Change #12 waiting for you: start the build',
      tone: 'attention',
    });
    expect(matchesFilter(p, 'needs-you')).toBe(true);
    expect(matchesFilter(p, 'live')).toBe(true);
  });

  it('a change being built keeps its product live, and a stuck change sorts first', () => {
    const building = {
      ...live,
      changes: [{ ...change(12, null), states: ['building'] as ProjectSummary['states'] }],
    };
    expect(describeProject(building).text).toBe('Live · change #12 in progress');
    const stuck = { ...live, number: 2, changes: [change(13, 'stuck')] };
    expect(describeProject(stuck)).toEqual({ text: 'Change #13 stuck at Board', tone: 'danger' });
    expect(sortProjects([building, stuck]).map((p) => p.number)).toEqual([2, 1]);
  });
});
