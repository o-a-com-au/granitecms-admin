import { createContext, useContext, useEffect, type ReactNode } from 'react';

// AppShell now owns the one persistent top bar every route renders
// inside (docs/designs/Revised-Pages.png) - Save/Discard used to be
// pinned in PageEditorPage's own footer precisely because there was no
// shared header for them to live in. A leaf route registers whatever
// it wants shown in the top bar's own action slot via usePageActions
// below; AppShell renders whatever's currently registered. A plain
// context setter, not a portal - AppShell only ever has the one slot
// these belong in, so a leaf route only needs to say "here's what I
// want shown", not target an arbitrary DOM node.
const PageActionsContext = createContext<((node: ReactNode | null) => void) | null>(null);

export function PageActionsProvider({
  setActions,
  children,
}: {
  setActions: (node: ReactNode | null) => void;
  children: ReactNode;
}) {
  return <PageActionsContext.Provider value={setActions}>{children}</PageActionsContext.Provider>;
}

// Registers `node` as the current page's top-bar actions for as long
// as the calling component stays mounted, clearing itself on unmount
// (or whenever `node` changes) so navigating away from a page with
// actions never leaves a stale Save/Discard pair rendered over
// whatever's now on screen.
export function usePageActions(node: ReactNode | null): void {
  const setActions = useContext(PageActionsContext);
  useEffect(() => {
    setActions?.(node);
    return () => setActions?.(null);
  }, [setActions, node]);
}
