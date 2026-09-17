import type { ChangeEvent, ReactNode } from 'react';
import { CloseIcon } from '../sections/CloseIcon.tsx';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  // Extra class(es) on the wrapper (not the input itself) - for a call
  // site that needs its own outer sizing. Most call sites need none:
  // inside a .panel-toolbar, that toolbar's own .search-input rule
  // already sizes the wrapper (pages-hub.css).
  className?: string;
  // An optional control rendered inside the field, to the right of the
  // clear button - the media library's kind filter (requested directly,
  // with a mockup putting it inside the field rather than beside it).
  // Optional so the other two call sites (Redirects, Add Section) are
  // untouched and render exactly as before.
  trailing?: ReactNode;
}

// A plain type="search" input's own native cancel button (the built-in
// WebKit/Blink "x" that appears once there's text) can't be restyled
// to use this app's own icon set - CSS can only hide it entirely, not
// swap its glyph - so this renders its own CloseIcon button instead
// and turns the native one off (search-input.css). Reported directly:
// every other Clear/Close cross in the app had already been brought
// onto CloseIcon, but the browser's own default search-clear "x" (used
// by every .content-search field - Redirects/Media/Add Section) still
// wasn't, being native chrome rather than one of this app's own
// buttons.
export function SearchInput({ value, onChange, placeholder, className, trailing }: SearchInputProps) {
  const classes = ['search-input'];
  if (trailing !== undefined) {
    classes.push('search-input--has-trailing');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(' ')}>
      <input
        type="search"
        className="content-search"
        placeholder={placeholder}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
      {/* Clear and trailing share one absolutely-positioned flex row
          rather than each being positioned against the wrapper
          independently. The clear button used to sit at a fixed
          right: 0.6rem of its own, which a second control inside the
          field would have sat directly on top of. */}
      <div className="search-input-adornments">
        {value !== '' && (
          <button type="button" className="search-input-clear" aria-label="Clear search" onClick={() => onChange('')}>
            <CloseIcon />
          </button>
        )}
        {trailing}
      </div>
    </div>
  );
}
