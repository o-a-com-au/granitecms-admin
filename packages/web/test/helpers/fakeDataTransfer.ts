// jsdom's synthetic DragEvent never populates a real DataTransfer the
// way a genuine browser drag does - fireEvent.dragStart(el) alone
// leaves event.dataTransfer undefined, which crashes SectionList.tsx/
// BlockList.tsx's own onDragStart handlers (they set effectAllowed and
// call setDragImage on it, exactly as a real drag always provides).
// Shared by every test that fires a drag-start on a real row's drag
// handle, rather than each one re-stubbing the same minimal shape.
export function createFakeDataTransfer(): DataTransfer {
  return {
    effectAllowed: 'none',
    setDragImage: () => {},
  } as unknown as DataTransfer;
}
