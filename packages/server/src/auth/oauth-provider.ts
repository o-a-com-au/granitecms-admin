// One generic shape both providers implement, so routes/oauth.ts's
// redirect/callback flow is written once, not once per provider.
// resolveIdentity is the one genuinely provider-specific part: Google
// returns a signed ID token to verify, GitHub returns a bearer token
// you call its own REST API with.
export interface OAuthProvider {
  id: 'google' | 'github';
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  resolveIdentity: (tokenResponse: unknown) => Promise<{ email: string; name: string }>;
}
