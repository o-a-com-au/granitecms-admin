import { useState } from 'react';
import { SectionSettingsForm } from './SectionSettingsForm.tsx';
import { BlockList } from './BlockList.tsx';
import type { FieldErrorMap, Instance, ThemeTypeSchemas } from './instance-types.ts';

interface SectionRowProps {
  section: Instance;
  index: number;
  total: number;
  sectionTypes: ThemeTypeSchemas;
  blockTypes: ThemeTypeSchemas;
  fieldErrors?: FieldErrorMap;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onChange: (section: Instance) => void;
}

// I4: a section's OWN acceptsBlocks flag (not a block's) decides
// whether its BlockList renders at all - "a section that does not
// support blocks shows no block controls" is enforced here, not left
// to BlockList itself (which always shows full controls once mounted).
function SectionRow({ section, index, total, sectionTypes, blockTypes, fieldErrors, onMoveUp, onMoveDown, onRemove, onChange }: SectionRowProps) {
  const schema = sectionTypes.schemas[section.type] as Record<string, unknown> | undefined;
  const acceptsBlocks = sectionTypes.acceptsBlocks[section.type] === true;

  function handleRemove(): void {
    if (window.confirm(`Remove this "${section.type}" section? This cannot be undone.`)) {
      onRemove();
    }
  }

  return (
    <li>
      <div>
        <strong>{section.type}</strong>
        <button type="button" onClick={onMoveUp} disabled={index === 0}>
          Move up
        </button>
        <button type="button" onClick={onMoveDown} disabled={index === total - 1}>
          Move down
        </button>
        <button type="button" onClick={handleRemove}>
          Remove section
        </button>
      </div>
      <SectionSettingsForm
        schema={schema}
        settings={section.settings}
        onChange={(settings) => onChange({ ...section, settings })}
        fieldErrors={fieldErrors?.[section.id]}
      />
      {acceptsBlocks && (
        <BlockList
          blocks={section.blocks ?? []}
          blockTypes={blockTypes}
          fieldErrors={fieldErrors}
          onChange={(blocks) => onChange({ ...section, blocks })}
        />
      )}
    </li>
  );
}

export interface SectionListProps {
  sections: Instance[];
  sectionTypes: ThemeTypeSchemas;
  blockTypes: ThemeTypeSchemas;
  fieldErrors?: FieldErrorMap;
  onChange: (sections: Instance[]) => void;
}

// I1: "editable, reorderable list" - move-up/move-down buttons, add
// (I2, sourced from the fetched theme schemas)/remove-with-confirm,
// one settings form per section, plus a nested BlockList for section
// types that accept blocks (I4).
export function SectionList({ sections, sectionTypes, blockTypes, fieldErrors, onChange }: SectionListProps) {
  const sectionTypeNames = Object.keys(sectionTypes.schemas);
  const [selectedType, setSelectedType] = useState(sectionTypeNames[0] ?? '');

  function moveSection(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= sections.length) {
      return;
    }
    const next = [...sections];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved as Instance);
    onChange(next);
  }

  function removeSection(index: number): void {
    onChange(sections.filter((_, i) => i !== index));
  }

  function updateSection(index: number, updated: Instance): void {
    onChange(sections.map((section, i) => (i === index ? updated : section)));
  }

  function addSection(): void {
    if (!selectedType) {
      return;
    }
    const acceptsBlocks = sectionTypes.acceptsBlocks[selectedType] === true;
    const newSection: Instance = {
      id: crypto.randomUUID(),
      type: selectedType,
      settings: {},
      ...(acceptsBlocks ? { blocks: [] } : {}),
    };
    onChange([...sections, newSection]);
  }

  return (
    <div>
      <ul>
        {sections.map((section, index) => (
          <SectionRow
            key={section.id}
            section={section}
            index={index}
            total={sections.length}
            sectionTypes={sectionTypes}
            blockTypes={blockTypes}
            fieldErrors={fieldErrors}
            onMoveUp={() => moveSection(index, -1)}
            onMoveDown={() => moveSection(index, 1)}
            onRemove={() => removeSection(index)}
            onChange={(updated) => updateSection(index, updated)}
          />
        ))}
      </ul>
      {sectionTypeNames.length > 0 && (
        <div>
          <label>
            Section type
            <select value={selectedType} onChange={(event) => setSelectedType(event.target.value)}>
              {sectionTypeNames.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={addSection}>
            Add section
          </button>
        </div>
      )}
    </div>
  );
}
