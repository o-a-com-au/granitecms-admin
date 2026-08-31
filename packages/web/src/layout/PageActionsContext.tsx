import { createContext, useContext, useEffect, type ReactNode } from 'react';

// AppShell now owns the one persistent top bar every route renders
// inside (docs/designs/Revised-Pages.png) - Save/Discard used to be
// pinned in PageEditorPage's own footer, and the device-size toggle in
// PreviewFrame's own top bar, precisely because there was no shared
// header for either to live in. A leaf route registers whatever it
// wants shown in one of AppShell's own top-bar slots via the hooks
// below; AppShell renders whatever's currently registered in each. A
// plain context setter per slot, not a portal - AppShell only ever has
// the one place each belongs, so a leaf route only needs to say
// "here's what I want shown", not target an arbitrary DOM node.
//
// One factory, not two independent copies of the same three-part
// shape - PageActionsProvider/usePageActions and
// PageDeviceToggleProvider/usePageDeviceToggle are identical apart
// from which slot they target, and a second copy-pasted instance is
// exactly the signal this project's own "three similar lines" rule of
// thumb treats as a real abstraction, not a premature one.
function createChromeSlot() {
  const Context = createContext<((node: ReactNode | null) => void) | null>(null);

  function Provider({ setNode, children }: { setNode: (node: ReactNode | null) => void; children: ReactNode }) {
    return <Context.Provider value={setNode}>{children}</Context.Provider>;
  }

  // Registers `node` into this slot for as long as the calling
  // component stays mounted, clearing itself on unmount (or whenever
  // `node` changes) so navigating away from a page that filled a slot
  // never leaves stale content rendered over whatever's now on screen.
  function useSlot(node: ReactNode | null): void {
    const setNode = useContext(Context);
    useEffect(() => {
      setNode?.(node);
      return () => setNode?.(null);
    }, [setNode, node]);
  }

  return { Provider, useSlot };
}

const pageActionsSlot = createChromeSlot();

export function PageActionsProvider({
  setActions,
  children,
}: {
  setActions: (node: ReactNode | null) => void;
  children: ReactNode;
}) {
  return <pageActionsSlot.Provider setNode={setActions}>{children}</pageActionsSlot.Provider>;
}

export const usePageActions = pageActionsSlot.useSlot;

const pageDeviceToggleSlot = createChromeSlot();

export function PageDeviceToggleProvider({
  setDeviceToggle,
  children,
}: {
  setDeviceToggle: (node: ReactNode | null) => void;
  children: ReactNode;
}) {
  return <pageDeviceToggleSlot.Provider setNode={setDeviceToggle}>{children}</pageDeviceToggleSlot.Provider>;
}

export const usePageDeviceToggle = pageDeviceToggleSlot.useSlot;
