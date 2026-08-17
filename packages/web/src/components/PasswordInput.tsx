import { useId, useState, type ChangeEvent } from 'react';

interface PasswordInputProps {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  hint?: string;
  id?: string;
}

// The label and the toggle button are deliberately not both nested
// inside one <label> - Testing Library's getByLabelText treats every
// labelable descendant (a <button> counts) as a match for a wrapping
// label, which would make every existing getByLabelText('Password')
// query ambiguous. An explicit htmlFor/id pair keeps the label
// associated with just the input, with the toggle as a plain sibling.
export function PasswordInput({ label, value, onChange, autoComplete, required, minLength, hint, id }: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field-group">
      <label htmlFor={inputId}>{label}</label>
      <div className="password-field">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-2.68 3.9M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {hint && <p className="password-hint">{hint}</p>}
    </div>
  );
}
