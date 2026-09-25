// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { routeNotification } from '../../src/utils/notifications';

describe('notification routing', () => {
  it('routes a notification to the exact PAIOS workflow', () => {
    let received: unknown;
    window.addEventListener('paios_notification_route', (event) => { received = (event as CustomEvent).detail; }, { once: true });
    routeNotification({ screen: 'HEALTH', medicationId: 'med_1' });
    expect(received).toEqual({ screen: 'HEALTH', medicationId: 'med_1' });
  });
});
