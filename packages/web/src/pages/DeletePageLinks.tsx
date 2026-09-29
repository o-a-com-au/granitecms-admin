import { useEffect, useId, useState } from 'react';
import { fetchPageLinks, type PageLinkReference } from '../api/site-content.ts';
import { LinkInput } from '../sections/LinkInput.tsx';
import { deriveMenuName } from './deriveMenuName.ts';

export interface DeletePageLinksProps {
  siteId: string;
  // The page's own address.
  url: string;
  redirectTo: string;
  onRedirectToChange: (value: string) => void;
}

function describe(reference: PageLinkReference): string {
  if (reference.kind === 'settings') {
    return 'Site settings';
  }
  if (reference.kind === 'menu') {
    // A menu with no display name of its own is labelled by its file;
    // named from its handle then, as the Menus list does.
    const name = reference.label === reference.path ? deriveMenuName(reference.path) : reference.label;
    return `${name} (menu)`;
  }
  return reference.kind === 'draft' ? `${reference.label} (draft)` : reference.label;
}

// The delete confirmation's extra part: what on the site links to the
// page (those links would lead nowhere once it's gone), and an optional
// page to send its old address to instead - added as a redirect in the
// same commit as the delete, which also rescues links from other sites
// and bookmarks. The owner chose a warning with that option over
// refusing the delete.
export function DeletePageLinks({ siteId, url, redirectTo, onRedirectToChange }: DeletePageLinksProps) {
  // undefined while loading; null when the site can't say (older CMS).
  const [references, setReferences] = useState<PageLinkReference[] | null | undefined>(undefined);
  const labelId = useId();

  useEffect(() => {
    let cancelled = false;
    setReferences(undefined);
    void fetchPageLinks(siteId, url).then((found) => {
      if (!cancelled) {
        setReferences(found);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, url]);

  return (
    <div className="delete-page-links">
      {references === undefined && <p className="delete-page-links-note">Checking what links to this page...</p>}
      {references && references.length === 0 && <p className="delete-page-links-note">Nothing on this website links to it.</p>}
      {references && references.length > 0 && (
        <>
          <p>
            {references.length === 1 ? 'One place links to it' : `${references.length} places link to it`}, and would lead to a
            missing page:
          </p>
          <ul className="delete-page-links-list">
            {references.map((reference) => (
              <li key={reference.path}>{describe(reference)}</li>
            ))}
          </ul>
        </>
      )}
      <div className="schema-field-label">
        <span id={labelId}>Send visitors to another page instead (optional)</span>
        <LinkInput siteId={siteId} value={redirectTo} onChange={onRedirectToChange} labelledBy={labelId} placeholder="Search pages" />
      </div>
    </div>
  );
}
