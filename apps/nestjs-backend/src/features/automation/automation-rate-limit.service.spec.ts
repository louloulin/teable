import { AutomationRateLimitService } from './automation-rate-limit.service';

describe('AutomationRateLimitService', () => {
  it('allows five email deliveries per base per second', () => {
    const service = new AutomationRateLimitService();
    expect(
      Array.from({ length: 5 }, () => service.consume('base-1', 'automation-1', 'email'))
    ).toEqual([true, true, true, true, true]);
    expect(service.consume('base-1', 'automation-1', 'email')).toBe(false);
    expect(service.consume('base-2', 'automation-1', 'email')).toBe(true);
  });

  it('limits webhook traffic per workflow before the base limit', () => {
    const service = new AutomationRateLimitService();
    expect(service.consume('base-1', 'automation-1', 'webhook')).toBe(true);
    expect(service.consume('base-1', 'automation-1', 'webhook')).toBe(true);
    expect(service.consume('base-1', 'automation-1', 'webhook')).toBe(false);
    expect(service.consume('base-1', 'automation-2', 'webhook')).toBe(true);
  });

  it('resets buckets explicitly', () => {
    const service = new AutomationRateLimitService();
    expect(service.consume('base-1', 'automation-1', 'email')).toBe(true);
    service.reset();
    expect(service.consume('base-1', 'automation-1', 'email')).toBe(true);
  });
});
