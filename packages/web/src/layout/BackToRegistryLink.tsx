import { Link } from 'react-router';

// A trivial shared component, not a layout shell - there is exactly
// one cross-page link target today and no multi-item navigation to
// speak of. Revisit an actual nav shell when a second distinct link
// target shows up.
export function BackToRegistryLink() {
  return <Link to="/">All sites</Link>;
}
