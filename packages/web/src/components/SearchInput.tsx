import type { ChangeEvent } from 'react';
import { CloseIcon } from '../sections/CloseIcon.tsx';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  // Extra class(es) on the wrapper (not the input itself) - for a call
  // site that needs its own outer sizing, e.g. AddSectionModal.tsx's
  // own .add-section-search, which used to sit directly on the <input>
  // before this wrapper existed.
  className?: string;
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
export function SearchInput({ value, onChange, placeholder, className }: SearchInputProps) {
  return (
    <div className={`search-input${className ? ` ${className}` : ''}`}>
      <input
        type="search"
        className="content-search"
        placeholder={placeholder}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
      {value !== '' && (
        <button type="button" className="search-input-clear" aria-label="Clear search" onClick={() => onChange('')}>
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
