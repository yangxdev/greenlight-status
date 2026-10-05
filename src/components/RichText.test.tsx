import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichText } from './RichText.tsx';

describe('RichText', () => {
  it('renders lists, bold, code and http links, and nothing else as markup', () => {
    render(
      <RichText
        text={
          '**Architect:** ready at https://github.com/a/b.\n\n- one `x`\n- two\n\n<img src=x onerror=alert(1)> javascript:alert(1)'
        }
      />,
    );
    expect(screen.getByText('Architect:').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: 'github.com/a/b' })).toHaveAttribute(
      'href',
      'https://github.com/a/b',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('x').tagName).toBe('CODE');
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('turns bullets under a heading line into a list', () => {
    render(<RichText text={'**Changed:**\n- one\n- two\nAfter.'} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('After.').tagName).toBe('P');
  });
});
