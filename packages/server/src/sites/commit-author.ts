// The git commit author sent with every publish/unpublish - always
// resolved server-side from the logged-in admin's own stored identity
// (require-auth.ts's currentUser), never supplied by the browser.
export interface CommitAuthor {
  name: string;
  email: string;
}
