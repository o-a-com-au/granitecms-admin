import { useEffect, useState } from 'react';

const SHOW_DELAY_MS = 300;

export interface TopLoadingBarProps {
  active: boolean;
}

// A thin bar across the top of the viewport, replacing the plain
// "Loading..." text SiteStatusPanel used to show on the four list-
// style screens (Pages/Menus/Media/Redirects) - a real fetch on a
// reasonable connection finishes well under SHOW_DELAY_MS, so most
// loads now show nothing at all instead of a message that would only
// ever flash past. Only a load that's actually taking a moment shows
// anything, and what it shows communicates "still working" without
// implying a specific duration the way a spinner or a percentage would.
export function TopLoadingBar({ active }: TopLoadingBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active]);

  if (!visible) {
    return null;
  }

  return (
    <div className="top-loading-bar" role="status" aria-label="Loading">
      <div className="top-loading-bar-fill" />
    </div>
  );
}
