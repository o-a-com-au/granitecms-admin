import { useState } from 'react';
import { SectionSettingsForm } from './SectionSettingsForm.tsx';
import type { FieldErrorMap, Instance, ThemeTypeSchemas } from './instance-types.ts';

interface BlockRowProps {
  block: Instance;
  index: number;
  total: number;
  blockTypes: ThemeTypeSchemas;
  fieldErrors?: FieldErrorMap;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onChange: (block: Instance) => void;
}

// I4: nested blocks (a block that itself accepts blocks - e.g. a
// "group" block whose whole purpose is nesting others) reuse this
// exact same BlockList recursively, one level per acceptsBlocks=true.
function BlockRow({ block, index, total, blockTypes, fieldErrors, onMoveUp, onMoveDown, onRemove, onChange }: BlockRowProps) {
  const schema = blockTypes.schemas[block.type] as Record<string, unknown> | undefined;
  const acceptsNestedBlocks = blockTypes.acceptsBlocks[block.type] === true;

  function handleRemove(): void {
    if (window.confirm(`Remove this "${block.type}" block? This cannot be undone.`)) {
      onRemove();
    }
  }

  return (
    <li>
      <div>
        <strong>{block.type}</strong>
        <button type="button" onClick={onMoveUp} disabled={index === 0}>
          Move up
        </button>
        <button type="button" onClick={onMoveDown} disabled={index === total - 1}>
          Move down
        </button>
        <button type="button" onClick={handleRemove}>
          Remove block
        </button>
      </div>
      <SectionSettingsForm
        schema={schema}
        settings={block.settings}
        onChange={(settings) => onChange({ ...block, settings })}
        fieldErrors={fieldErrors?.[block.id]}
      />
      {acceptsNestedBlocks && (
        <BlockList
          blocks={block.blocks ?? []}
          blockTypes={blockTypes}
          fieldErrors={fieldErrors}
          onChange={(blocks) => onChange({ ...block, blocks })}
        />
      )}
    </li>
  );
}

export interface BlockListProps {
  blocks: Instance[];
  blockTypes: ThemeTypeSchemas;
  fieldErrors?: FieldErrorMap;
  onChange: (blocks: Instance[]) => void;
}

// I1, I4: move-up/move-down buttons (zero new dependency, matches
// this project's consistent preference for the simplest mechanism
// that works - same reasoning as choosing plain jsdiff over a
// diff-viewer library in Group H), add/remove, one settings form per
// block. Whether this component renders at ALL for a given section/
// block is the caller's decision (I4's "shows no block controls") -
// once rendered, it always shows full controls.
export function BlockList({ blocks, blockTypes, fieldErrors, onChange }: BlockListProps) {
  const blockTypeNames = Object.keys(blockTypes.schemas);
  const [selectedType, setSelectedType] = useState(blockTypeNames[0] ?? '');

  function moveBlock(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) {
      return;
    }
    const next = [...blocks];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved as Instance);
    onChange(next);
  }

  function removeBlock(index: number): void {
    onChange(blocks.filter((_, i) => i !== index));
  }

  function updateBlock(index: number, updated: Instance): void {
    onChange(blocks.map((block, i) => (i === index ? updated : block)));
  }

  // I2: sourced from the fetched theme schemas, not a hardcoded list.
  function addBlock(): void {
    if (!selectedType) {
      return;
    }
    const acceptsNested = blockTypes.acceptsBlocks[selectedType] === true;
    const newBlock: Instance = {
      id: crypto.randomUUID(),
      type: selectedType,
      settings: {},
      ...(acceptsNested ? { blocks: [] } : {}),
    };
    onChange([...blocks, newBlock]);
  }

  return (
    <div>
      <ul>
        {blocks.map((block, index) => (
          <BlockRow
            key={block.id}
            block={block}
            index={index}
            total={blocks.length}
            blockTypes={blockTypes}
            fieldErrors={fieldErrors}
            onMoveUp={() => moveBlock(index, -1)}
            onMoveDown={() => moveBlock(index, 1)}
            onRemove={() => removeBlock(index)}
            onChange={(updated) => updateBlock(index, updated)}
          />
        ))}
      </ul>
      {blockTypeNames.length > 0 && (
        <div>
          <label>
            Block type
            <select value={selectedType} onChange={(event) => setSelectedType(event.target.value)}>
              {blockTypeNames.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={addBlock}>
            Add block
          </button>
        </div>
      )}
    </div>
  );
}
