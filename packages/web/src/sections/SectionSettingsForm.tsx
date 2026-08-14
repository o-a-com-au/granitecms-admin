import { useState } from 'react';
import { SchemaField } from './SchemaField.tsx';
import { fieldLabel } from './instance-types.ts';

export interface SectionSettingsFormProps {
  siteId: string;
  schema: Record<string, unknown> | undefined;
  settings: Record<string, unknown>;
  onChange: (settings: Record<string, unknown>) => void;
  // I5: keyed by the plain settings property name (e.g. "heading"),
  // already stripped of its "/sections/N/settings/" prefix by the
  // caller - every real theme schema today is flat (no nested
  // settings objects), so this simple keying covers every real case.
  fieldErrors?: Record<string, string>;
}

function UnknownTypeFallback({ settings, onChange }: Pick<SectionSettingsFormProps, 'settings' | 'onChange'>) {
  const [text, setText] = useState(() => JSON.stringify(settings, null, 2));
  const [invalid, setInvalid] = useState(false);

  function handleChange(next: string): void {
    setText(next);
    try {
      const parsed = JSON.parse(next) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        setInvalid(false);
        onChange(parsed as Record<string, unknown>);
        return;
      }
      setInvalid(true);
    } catch {
      setInvalid(true);
    }
  }

  return (
    <div className="section-settings-form">
      <p role="alert">Unknown type - editing raw settings.</p>
      <textarea value={text} onChange={(event) => handleChange(event.target.value)} />
      {invalid && <p role="alert">Not valid JSON yet - not saved.</p>}
    </div>
  );
}

// I3, I5: one SchemaField per settings-schema property. A type the
// theme no longer declares (e.g. content authored against an older
// theme version) falls back to raw settings editing rather than
// silently hiding or discarding the instance.
export function SectionSettingsForm({ siteId, schema, settings, onChange, fieldErrors }: SectionSettingsFormProps) {
  if (!schema) {
    return <UnknownTypeFallback settings={settings} onChange={onChange} />;
  }

  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;

  return (
    <div className="section-settings-form">
      {Object.entries(properties).map(([key, propertySchema]) => (
        <SchemaField
          key={key}
          siteId={siteId}
          label={fieldLabel(propertySchema, key)}
          schema={propertySchema}
          value={settings[key]}
          onChange={(value) => onChange({ ...settings, [key]: value })}
          error={fieldErrors?.[key]}
        />
      ))}
    </div>
  );
}
