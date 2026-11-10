import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FeedSkeleton } from './FeedSkeleton';

describe('FeedSkeleton', () => {
  it('announces what is loading and hides the placeholder bars', () => {
    const { container } = render(<FeedSkeleton label="Loading comments" rows={2} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading comments');
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });
});
