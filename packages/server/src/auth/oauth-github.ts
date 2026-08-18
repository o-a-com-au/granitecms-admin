import type { OAuthProvider } from './oauth-provider.ts';
import { splitFullName } from './full-name.ts';

interface GithubTokenResponse {
  access_token: string;
}

function isGithubTokenResponse(value: unknown): value is GithubTokenResponse {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).access_token === 'string';
}

interface GithubProfile {
  email: string | null;
  name: string | null;
  login: string;
}

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

// No new dependency, unlike Google's provider - GitHub's own REST API
// is called directly with plain fetch, no signature verification of
// its own to reimplement.
export function createGithubProvider(clientId: string, clientSecret: string): OAuthProvider {
  return {
    id: 'github',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    clientId,
    clientSecret,
    scope: 'read:user user:email',
    async resolveIdentity(tokenResponse: unknown) {
      if (!isGithubTokenResponse(tokenResponse)) {
        throw new Error('GitHub token response did not include an access token');
      }
      const headers = {
        Authorization: `Bearer ${tokenResponse.access_token}`,
        'User-Agent': 'cms-agent-admin',
        Accept: 'application/json',
      };

      const profileResponse = await fetch('https://api.github.com/user', { headers });
      if (!profileResponse.ok) {
        throw new Error('Failed to fetch the GitHub user profile');
      }
      const profile = (await profileResponse.json()) as GithubProfile;

      // The profile's own email field is null when the account's email
      // is private - a second call to /user/emails finds the verified
      // primary address in that case.
      let email = profile.email;
      if (!email) {
        const emailsResponse = await fetch('https://api.github.com/user/emails', { headers });
        if (emailsResponse.ok) {
          const emails = (await emailsResponse.json()) as GithubEmail[];
          email = emails.find((entry) => entry.primary && entry.verified)?.email ?? null;
        }
      }
      if (!email) {
        throw new Error('GitHub account has no verified email available');
      }

      // No given/family name equivalent in GitHub's own REST response -
      // heuristically split whatever combined name (or login, as a
      // last resort) is available.
      const { firstName, lastName } = splitFullName(profile.name ?? profile.login);
      return { email, firstName, lastName };
    },
  };
}
