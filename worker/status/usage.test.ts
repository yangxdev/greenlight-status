import { describe, expect, it } from 'vitest';
import { addUsage, parseUsage, sumUsage, totalUsage } from './usage.ts';

const marker = (
  stage: string,
  fields = 'in=100 out=20 cache_read=3000 cache_write=400 turns=7 cost=0.5',
) => `<!-- greenlight:usage stage=${stage} ${fields} -->`;

describe('parseUsage', () => {
  it('reads every field of a marker', () => {
    expect(parseUsage(`**Architect:** ready\n\n${marker('architect')}`).get('architect')).toEqual({
      input: 100,
      output: 20,
      cacheRead: 3000,
      cacheWrite: 400,
      turns: 7,
      costUsd: 0.5,
      runs: 1,
    });
  });

  it('keeps one marker per stage, the last: a marker inside text an agent wrote comes first and loses', () => {
    const text = `${marker('reviewer', 'in=999999 out=0')}\n${marker('architect')}\n${marker('reviewer', 'in=5 out=6')}`;
    const usage = parseUsage(text);
    expect([...usage.keys()]).toEqual(['reviewer', 'architect']);
    expect(usage.get('reviewer')).toMatchObject({ input: 5, output: 6, runs: 1 });
  });

  it('skips stages outside the ten and treats bad numbers as zero', () => {
    const usage = parseUsage(
      `${marker('scribe')}\n${marker('nope')}\n${marker('factory', 'in=-4 out=abc cost=Infinity turns=3')}`,
    );
    expect([...usage.keys()]).toEqual(['factory']);
    expect(usage.get('factory')).toMatchObject({ input: 0, output: 0, costUsd: 0, turns: 3 });
  });

  it('finds nothing in text without markers', () => {
    expect(parseUsage('**Factory:** PR opened <!-- greenlight:repo=a/b -->').size).toBe(0);
  });
});

describe('sumUsage and totalUsage', () => {
  it('adds runs up per stage, then across stages', () => {
    const byStage = sumUsage([
      marker('factory'),
      marker('factory', 'in=1 out=2 cache_read=3 cache_write=4 turns=5 cost=0.25'),
      marker('inspector'),
    ]);
    expect(byStage.get('factory')).toEqual({
      input: 101,
      output: 22,
      cacheRead: 3003,
      cacheWrite: 404,
      turns: 12,
      costUsd: 0.75,
      runs: 2,
    });
    expect(totalUsage(byStage.values())).toMatchObject({ input: 201, runs: 3 });
    expect(totalUsage([null, null])).toBeNull();
  });

  it('never changes the totals it adds to', () => {
    const one = parseUsage(marker('critic')).get('critic');
    if (!one) throw new Error('no usage');
    addUsage(one, one);
    expect(one.runs).toBe(1);
  });
});
