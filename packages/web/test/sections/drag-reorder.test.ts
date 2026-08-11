import { describe, expect, it } from 'vitest';
import { computeDropIndex, reorderList } from '../../src/sections/drag-reorder.ts';

describe('computeDropIndex', () => {
  it('the top half of a row drops before it (same index)', () => {
    expect(computeDropIndex(10, { top: 0, height: 40 }, 2)).toBe(2);
  });

  it('the bottom half of a row drops after it (index + 1)', () => {
    expect(computeDropIndex(30, { top: 0, height: 40 }, 2)).toBe(3);
  });
});

describe('reorderList', () => {
  it('moves an item down past several others', () => {
    expect(reorderList(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item up past several others', () => {
    expect(reorderList(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('moving to the gap directly above its own position is a no-op', () => {
    expect(reorderList(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('moving to the gap directly below its own position is also a no-op (that gap collapses onto the same order)', () => {
    expect(reorderList(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'b', 'c']);
  });

  it('dropping at the very end moves the item to the last position', () => {
    expect(reorderList(['a', 'b', 'c'], 0, 3)).toEqual(['b', 'c', 'a']);
  });

  it('dropping at the very start moves the item to the first position', () => {
    expect(reorderList(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });
});
