/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchModal } from '../../src/components/SearchModal';
import { SearchResults } from '../../src/types';

describe('Unit Test: SearchModal Accessibility & Keyboard Navigation', () => {
  let container: HTMLDivElement;

  const emptySearchResults: SearchResults = {
    tasks: [],
    timeline: [],
    captures: [],
    journal: [],
    studyCards: [],
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders modal with proper accessibility attributes', () => {
    const root = createRoot(container);
    act(() => {
      root.render(
        <SearchModal
          searchResults={emptySearchResults}
          onSearch={() => {}}
          onDismiss={() => {}}
        />
      );
    });

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBe('Search dialog');

    root.unmount();
  });

  it('calls onDismiss when Escape key is pressed', () => {
    const onDismissMock = vi.fn();
    const root = createRoot(container);

    act(() => {
      root.render(
        <SearchModal
          searchResults={emptySearchResults}
          onSearch={() => {}}
          onDismiss={onDismissMock}
        />
      );
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onDismissMock).toHaveBeenCalledTimes(1);

    root.unmount();
  });
});
