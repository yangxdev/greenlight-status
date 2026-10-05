import { describe, expect, it } from 'vitest';
import { parseCriticTable, parseIdeaIssues, parseReport, parseWatchlist } from './parse.ts';

const HEAD = '| Name | Pain | Competition | MVP | Reach | Total |\n|---|---|---|---|---|---|\n';

describe('parseCriticTable', () => {
  it('AC1: reads Name/Total and Idea/13/20 tables', () => {
    const a =
      '| Name | Pain | Competition | MVP | Reach | Total | Verdict |\n|---|---|---|---|---|---|---|\n| **Foo** | 3 | 3 | 4 | 3 | 13 | meh |';
    const b =
      '| Idea | Pain | Competition | MVP | Reach | Total |\n|---|---|---|---|---|---|\n| `Bar` | 4 | 4 | 3 | 4 | 15/20 |';
    expect(parseCriticTable(a)).toEqual([
      { name: 'Foo', pain: 3, competition: 3, mvp: 4, reach: 3, total: 13, verdict: 'meh' },
    ]);
    expect(parseCriticTable(b)[0]).toMatchObject({ name: 'Bar', total: 15, verdict: '' });
  });

  it('AC2: drops bad rows, returns [] without a table, never throws', () => {
    const t = `${HEAD}| A | x | 1 | 1 | 1 | 4 |\n| B | 1 | 1 | 1 | 1 | 4 |`;
    expect(parseCriticTable(t).map((r) => r.name)).toEqual(['B']);
    expect(parseCriticTable('| Name | Total |\n|---|---|\n| A | 3 |')).toEqual([]);
    expect(parseCriticTable('nothing')).toEqual([]);
    expect(parseCriticTable(undefined)).toEqual([]);
  });

  it('AC3: reads only the first table with the required headers', () => {
    const md = `| Other | Thing |\n|---|---|\n| x | y |\n\n${HEAD}| First | 1 | 1 | 1 | 1 | 4 |\n\n${HEAD}| Second | 1 | 1 | 1 | 1 | 4 |`;
    expect(parseCriticTable(md).map((r) => r.name)).toEqual(['First']);
  });
});

describe('parseIdeaIssues', () => {
  it('AC4: filters and maps states', () => {
    const issue = (n: number, title: string, state: string, labels: string[], extra = {}) => ({
      number: n,
      title,
      state,
      labels: labels.map((name) => ({ name })),
      html_url: `https://github.com/o/r/issues/${n}`,
      ...extra,
    });
    const ideas = parseIdeaIssues(
      [
        issue(1, '[idea] PR', 'open', [], { pull_request: {} }),
        issue(2, 'Not an idea', 'open', ['idea']),
        issue(3, '[idea] Closed', 'closed', ['bug']),
        issue(4, '[idea] Open', 'open', []),
        issue(5, '[idea] Both', 'open', ['stuck', 'live']),
      ],
      'o/r',
    );
    expect(ideas.map((i) => [i.number, i.name, i.states])).toEqual([
      [3, 'Closed', ['archived']],
      [4, 'Open', ['idea']],
      [5, 'Both', ['live', 'stuck']],
    ]);
    expect(parseIdeaIssues('nope', 'o/r')).toEqual([]);
  });
});

describe('parseWatchlist', () => {
  it('AC5: reads entries and tolerates missing bullets', () => {
    const md = `# Watchlist\n\n## First\n- **Best score:** 13/20 on 2026-09-30 (run)\n- **Last evidence:** posts\n- **Problem:** slow\n- **Needs:** a buyer\n\n## Second\n- **Best score:** 12/20 on 2026-09-01\n- **Last evidence:** none\n- **Problem:** hard\n`;
    const [a, b] = parseWatchlist(md);
    expect(a).toMatchObject({
      name: 'First',
      bestScore: 13,
      bestScoreDate: '2026-09-30',
      needs: 'a buyer',
      problem: 'slow',
    });
    expect(b).toMatchObject({ name: 'Second', needs: '' });
  });
});

describe('parseReport', () => {
  it('AC6: drops report entries without a verdict, keeps week', () => {
    const r = parseReport({
      week: '2026-W40',
      summary: 's',
      products: [{ issue: 1, reason: 'r' }, { issue: 2, verdict: 'keep', reason: 'good' }, 'x'],
    });
    expect(r).toEqual({
      week: '2026-W40',
      summary: 's',
      products: [{ issue: 2, verdict: 'keep', reason: 'good' }],
    });
    expect(parseReport(null)).toBeNull();
  });
});
