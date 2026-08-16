/**
 * useVisiblePolling stops polling when the tab isn't visible.
 *
 * This is a capacity control, not a nicety: polling is the dominant load on
 * this backend (CAPACITY.md §2), and the hospital dashboard sits open on a
 * reception desk all day behind other windows. If someone ever "simplifies"
 * this back to a plain setInterval, these tests fail.
 */
import { render } from '@testing-library/react';
import { act } from 'react';
import { useVisiblePolling } from './useVisiblePolling';

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

function Poller({ onTick, interval = 1000, enabled = true }) {
  useVisiblePolling(onTick, interval, enabled);
  return null;
}

describe('useVisiblePolling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setVisibility('visible');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const advance = (ms) => act(() => { jest.advanceTimersByTime(ms); });

  it('polls on the interval while the tab is visible', () => {
    const tick = jest.fn();
    render(<Poller onTick={tick} />);

    advance(3000);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('stops polling once the tab is hidden', () => {
    const tick = jest.fn();
    render(<Poller onTick={tick} />);

    advance(2000);
    expect(tick).toHaveBeenCalledTimes(2);

    act(() => setVisibility('hidden'));
    advance(10000);
    // The whole point: ten intervals passed and none of them hit the API.
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('resumes when the tab comes back', () => {
    const tick = jest.fn();
    render(<Poller onTick={tick} />);

    act(() => setVisibility('hidden'));
    advance(5000);
    expect(tick).toHaveBeenCalledTimes(0);

    act(() => setVisibility('visible'));
    advance(2000);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('does not poll at all when disabled', () => {
    const tick = jest.fn();
    render(<Poller onTick={tick} enabled={false} />);

    advance(5000);
    expect(tick).not.toHaveBeenCalled();
  });

  it('stops polling after unmount', () => {
    const tick = jest.fn();
    const { unmount } = render(<Poller onTick={tick} />);

    advance(1000);
    unmount();
    advance(5000);
    expect(tick).toHaveBeenCalledTimes(1);
  });
});
