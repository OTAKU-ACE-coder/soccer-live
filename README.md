# Touchline

Touchline is a football hub with scores, fixtures, club follows, and a personalized news feed. The existing account pages use Supabase Auth.

## Football hub

[Open Touchline](https://otaku-ace-coder.github.io/web-login-page/football.html)

- Follow clubs and search for teams or topics. The For you feed ranks BBC Sport headlines based on your follows and recent searches, which are saved in this browser.
- Bundesliga and 2. Bundesliga scores and fixtures come from [OpenLigaDB](https://www.openligadb.de/) and are checked once a minute. The in-progress filter uses kickoff time and the provider's completion flag. Results can be delayed.
- The news panel reads a snapshot of the [BBC Sport football RSS feed](https://www.bbc.co.uk/sport/articles/cqllxj2n4kyo). Open BBC Sport for breaking news.

## Account previews

- [Preview directory](https://otaku-ace-coder.github.io/web-login-page/preview.html)
- [Sign up](https://otaku-ace-coder.github.io/web-login-page/index.html)
- [Log in](https://otaku-ace-coder.github.io/web-login-page/index.html?view=login)
- [Reset password](https://otaku-ace-coder.github.io/web-login-page/index.html?view=reset)

The previews use the live forms. Sign-up and password reset can send emails. The account page opens after sign-in.

## Run locally

Serve the project folder over HTTP and open `http://localhost:8000/preview.html`. From the project folder, run `python -m http.server 8000`. For the local confirmation and reset links, allow `http://localhost:8000/index.html` in Supabase.

## Supabase setup

1. Create a Supabase project. In its API settings, copy the project URL and **publishable** key (`sb_publishable_…`) into `config.js`. A legacy **anon** key also works. These values are public. Never paste a secret key (`sb_secret_…`), `service_role` key, database password, or SMTP credentials into this repository or frontend. Runtime key checks cannot make an already published secret safe; rotate any exposed secret immediately.
2. Enable the Email provider in Authentication settings. Enable email confirmation for registration, and set the server password minimum to at least 8 characters (the client uses 8). Stronger server rules are enforced by Supabase and displayed in the form.
3. Under Authentication → URL Configuration, set Site URL to your deployed site and allow the exact callback URL `https://your-domain/path/index.html`. For local development also allow `http://localhost:8000/index.html`. Use the same host consistently; localhost and 127.0.0.1 have separate storage. Keep confirmation/reset email templates using Supabase's standard `ConfirmationURL` link.
4. Configure custom SMTP for production confirmation and recovery emails. The default sender is restricted and is suitable only for testing with allowed recipients. SMTP credentials belong in Supabase settings only.
5. Serve this directory over HTTP locally, for example `python -m http.server 8000`, then open `http://localhost:8000/index.html`. Do not open HTML as `file://`. Deploy over HTTPS. The SDK loads from a pinned esm.sh URL and requires internet access.

## Flow and storage

- `auth-client.js` creates the shared Supabase client. `script.js` handles email/password login, registration, confirmation callbacks, reset emails and password updates. Passwords go directly to Supabase over HTTPS; application code does not store or log them.
- Registration either establishes a session (when confirmation is disabled) or asks the user to check email. Reset requests give a generic success message to avoid exposing account existence. Supabase validation, rate-limit and connection errors appear in the live status message. Fields also use native required/email/password validation and confirmation matching.
- This static browser app explicitly uses the implicit email callback flow. The SDK consumes callback tokens from the URL and emits `PASSWORD_RECOVERY` to show the new-password form; application code then clears the fragment. Do not add third-party analytics that might capture callback URLs. Password-reset links are single use and expire according to project settings.
- The SDK stores access/refresh tokens in browser localStorage, restores sessions and refreshes tokens automatically. Sessions persist across browser restarts until sign-out or expiry/revocation. The old nonfunctional Remember me checkbox has been removed to avoid suggesting a storage choice that does not exist. Never use a shared browser without signing out. Browser tokens are accessible to JavaScript: avoid untrusted scripts and HTML injection. User values/messages are rendered via `textContent`.
- `protected.js` checks `getUser()` with Supabase before revealing the account view, redirects unauthenticated visitors, listens for sign-out (including across tabs), and signs out through Supabase. If configuration or SDK loading fails, content remains hidden and an error is shown.

## Access control boundary

Password recovery survives a reload in the same tab using a sessionStorage marker containing only the user ID, never a password or token. The marker only selects the form; Supabase still authorizes the password update. It is cleared on successful update or sign-out. Stored sessions are verified before automatic navigation, so revoked sessions do not cause redirect loops. Network failures keep account content hidden and display an error.

`protected.html` is a client-side session gate, not a private server resource. Its static HTML/JS can always be downloaded. It contains no confidential data. Any future private data must be protected by Supabase Row Level Security (RLS) with policies tied to `auth.uid()`, or by a backend that validates tokens. Never rely on hidden HTML or browser redirects as data authorization. No database tables or RLS policies are needed for the current account-only page.

## Verification checklist (requires a configured project)

Run `node --test auth.test.cjs` for the local mocked flow tests. These verify application behavior, not live Supabase delivery, browser layout, or server configuration.

- Register with matching passwords; follow confirmation email; verify login and reload persistence.
- Test wrong password, malformed email, mismatched/short passwords and stronger server password rules.
- Request recovery while logged out and while logged in; open the link, change password, sign out, then verify only the new password works. Check expired/used reset links show an error.
- Open `protected.html` without a session: it must redirect without showing account details. With a valid session, it must display the signed-in email.
- Sign out and check the protected page in another tab also redirects. Test token expiry/revocation, offline behavior, and SDK/configuration failures.
- Check desktop/mobile layouts and keyboard focus. Do not use real credentials in screenshots, logs or committed fixtures.

References: [Password-based Auth](https://supabase.com/docs/guides/auth/passwords), [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [Auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [API keys](https://supabase.com/docs/guides/api/api-keys).
