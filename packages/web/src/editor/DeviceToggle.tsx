import { DeviceDesktopIcon, DeviceMobileIcon, DeviceTabletIcon } from '../icons/index.tsx';

export type DeviceTier = 'desktop' | 'tablet' | 'mobile';

export const DEVICE_TIERS: Array<{ tier: DeviceTier; label: string; Icon: typeof DeviceDesktopIcon }> = [
  { tier: 'desktop', label: 'Desktop', Icon: DeviceDesktopIcon },
  { tier: 'tablet', label: 'Tablet', Icon: DeviceTabletIcon },
  { tier: 'mobile', label: 'Mobile', Icon: DeviceMobileIcon },
];

export interface DeviceToggleProps {
  device: DeviceTier;
  onChange: (tier: DeviceTier) => void;
}

// Lives in AppShell's own top bar now (docs/designs/Revised-Page-Edit--
// Section-Edit.png), pushed there via usePageDeviceToggle - a
// controlled component rather than owning its own state, since
// PreviewFrame also needs the current tier to size its iframe. Icon-
// only, per the design - the label still exists as an accessible name
// (aria-label), just not shown visually.
export function DeviceToggle({ device, onChange }: DeviceToggleProps) {
  return (
    <div className="device-toggle" role="group" aria-label="Preview device size">
      {DEVICE_TIERS.map(({ tier, label, Icon }) => (
        <button
          key={tier}
          type="button"
          aria-pressed={device === tier}
          aria-label={`${label} preview`}
          onClick={() => onChange(tier)}
        >
          <span className="device-icon">
            <Icon />
          </span>
        </button>
      ))}
    </div>
  );
}
