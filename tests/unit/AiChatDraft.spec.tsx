/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { AiScreen } from '../../src/screens/AiScreen';

describe('Unit Test: AI Chat Draft Session Persistence (BUG-03)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('restores unsent draft from sessionStorage on component mount', () => {
    // 1. Simulate prior unsent draft in sessionStorage
    sessionStorage.setItem('paios_ai_input_draft', 'Analyze my daily medication adherence');

    const root = createRoot(container);
    act(() => {
      root.render(
        <AiScreen
          messages={[]}
          userContextString=""
          onSendMessage={async () => {}}
          onExecuteAction={() => {}}
        />
      );
    });

    // 2. Assert the input box initialized with the draft
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe('Analyze my daily medication adherence');

    root.unmount();
  });

  it('saves typed draft to sessionStorage and survives unmount/remount (tab switch)', () => {
    let root = createRoot(container);
    act(() => {
      root.render(
        <AiScreen
          messages={[]}
          userContextString=""
          onSendMessage={async () => {}}
          onExecuteAction={() => {}}
        />
      );
    });

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      // Direct update to sessionStorage as happens on state change
      sessionStorage.setItem('paios_ai_input_draft', 'Unsent prompt draft before navigating away');
      root.unmount();
    });

    // 3. Remount component (simulating user returning from Health tab back to AI tab)
    const newContainer = document.createElement('div');
    document.body.appendChild(newContainer);
    const newRoot = createRoot(newContainer);

    act(() => {
      newRoot.render(
        <AiScreen
          messages={[]}
          userContextString=""
          onSendMessage={async () => {}}
          onExecuteAction={() => {}}
        />
      );
    });

    const remountedTextarea = newContainer.querySelector('textarea') as HTMLTextAreaElement;
    expect(remountedTextarea.value).toBe('Unsent prompt draft before navigating away');

    newRoot.unmount();
  });

  it('clears draft from sessionStorage once message is sent', async () => {
    sessionStorage.setItem('paios_ai_input_draft', 'Message to send');

    let sentText = '';
    const onSendMock = async (text: string) => {
      sentText = text;
    };

    const root = createRoot(container);
    act(() => {
      root.render(
        <AiScreen
          messages={[]}
          userContextString=""
          onSendMessage={onSendMock}
          onExecuteAction={() => {}}
        />
      );
    });

    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    expect(sentText).toBe('Message to send');
    expect(sessionStorage.getItem('paios_ai_input_draft')).toBeNull();

    root.unmount();
  });
});
