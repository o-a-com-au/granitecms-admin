import { useState, type KeyboardEvent } from 'react';
import { AccordionArrowIcon } from './AccordionArrowIcon.tsx';
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
      <textarea className="textarea-monospace" value={text} onChange={(event) => handleChange(event.target.value)} />
      {invalid && <p role="alert">Not valid JSON yet - not saved.</p>}
    </div>
  );
}

// A property's "group" (a plain annotation in the theme's schema, like
// "title"): fields sharing one are shown together in an accordion.
// Anything else - absent, or not text - is ungrouped.
function groupOf(propertySchema: Record<string, unknown>): string | null {
  const group = propertySchema.group;
  return typeof group === 'string' && group.trim() !== '' ? group.trim() : null;
}

type Entry = [string, Record<string, unknown>];

// Ungrouped fields first, then each group in the order its first field
// appears in the schema.
function arrange(properties: Record<string, Record<string, unknown>>): { ungrouped: Entry[]; groups: Array<[string, Entry[]]> } {
  const ungrouped: Entry[] = [];
  const groups = new Map<string, Entry[]>();
  for (const entry of Object.entries(properties)) {
    const group = groupOf(entry[1]);
    if (group === null) {
      ungrouped.push(entry);
    } else {
      groups.set(group, [...(groups.get(group) ?? []), entry]);
    }
  }
  return { ungrouped, groups: [...groups] };
}

// I3, I5: one SchemaField per settings-schema property. A type the
// theme no longer declares (e.g. content authored against an older
// theme version) falls back to raw settings editing rather than
// silently hiding or discarding the instance. Fields with a "group" are
// shown in accordions, the same rows as the Menus list: the first
// starts open, and a group holding a field with an error opens so the
// error is seen.
export function SectionSettingsForm({ siteId, schema, settings, onChange, fieldErrors }: SectionSettingsFormProps) {
  const properties = (schema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const { ungrouped, groups } = arrange(properties);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(groups[0] ? [groups[0][0]] : []));

  if (!schema) {
    return <UnknownTypeFallback settings={settings} onChange={onChange} />;
  }

  const field = ([key, propertySchema]: Entry) => (
    <SchemaField
      key={key}
      siteId={siteId}
      label={fieldLabel(propertySchema, key)}
      schema={propertySchema}
      value={settings[key]}
      onChange={(value) => onChange({ ...settings, [key]: value })}
      error={fieldErrors?.[key]}
    />
  );

  function toggle(group: string): void {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }

  return (
    <div className="section-settings-form">
      {ungrouped.map(field)}
      {groups.length > 0 && (
        <ul className="instance-list settings-groups">
          {groups.map(([group, entries]) => {
            const expanded = open.has(group) || entries.some(([key]) => fieldErrors?.[key] !== undefined);
            const onKeyDown = (event: KeyboardEvent) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle(group);
              }
            };
            return (
              <li className="instance-row" key={group}>
                <div className="instance-row-main" role="button" tabIndex={0} aria-expanded={expanded} onClick={() => toggle(group)} onKeyDown={onKeyDown}>
                  {/* Decorative, as in the Menus list: the row itself is the control. */}
                  <button type="button" className="instance-row-chevron" tabIndex={-1} aria-hidden="true">
                    <span className={`instance-row-chevron-icon${expanded ? ' is-expanded' : ''}`}>
                      <AccordionArrowIcon />
                    </span>
                  </button>
                  <span className="instance-row-label">
                    <strong title={group}>{group}</strong>
                  </span>
                </div>
                {expanded && <div className="settings-group-fields">{entries.map(field)}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
