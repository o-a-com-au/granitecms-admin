// Pure drag-and-drop math shared by SectionList and BlockList - kept
// separate from the components (and unit-tested in isolation) because
// off-by-one errors here are easy to introduce and hard to spot just
// by eyeballing the component.

// Which gap the pointer is currently over, expressed as a single
// index into the list (0..length) - the blue drop-indicator line
// renders at this position, "before" the item currently at that
// index, or after the last item when index === list.length.
export function computeDropIndex(pointerY: number, rect: { top: number; height: number }, index: number): number {
  const midpoint = rect.top + rect.height / 2;
  return pointerY < midpoint ? index : index + 1;
}

// Moves the item at fromIndex to sit at dropIndex (a gap position, per
// computeDropIndex above - not a post-removal array index). Dropping
// into either gap immediately adjacent to the item's own current
// position is a no-op, not a same-order round-trip that still fires a
// change.
export function reorderList<T>(list: T[], fromIndex: number, dropIndex: number): T[] {
  if (dropIndex === fromIndex || dropIndex === fromIndex + 1) {
    return list;
  }
  const item = list[fromIndex];
  if (item === undefined) {
    return list;
  }
  const withoutItem = list.filter((_, i) => i !== fromIndex);
  const adjustedIndex = dropIndex > fromIndex ? dropIndex - 1 : dropIndex;
  const next = [...withoutItem];
  next.splice(adjustedIndex, 0, item);
  return next;
}
