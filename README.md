# Bluesky Sign-In Demo

A simple Node.js/Express web application that demonstrates OAuth authentication with Bluesky accounts.

## Features

- Sign in with Bluesky account using OAuth 2.0
- Stores user identity (DID and handle) locally
- Session management
- Simple, clean UI

## Prerequisites

- Node.js (v14 or higher)
- A Bluesky account for testing

## Installation

1. Install dependencies:
```bash
npm install
```

## Running the App

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://127.0.0.1:3000
```

4. Enter your Bluesky handle (e.g., `yourname.bsky.social`) and click "Sign in with Bluesky"

**Important Configuration Notes:**
- **Access via 127.0.0.1**: You must access the app at `http://127.0.0.1:3000` (not `localhost`) due to RFC 8252 requirements
- **Special localhost client_id**: For local development, Bluesky requires a special client_id format:
  ```
  http://localhost?redirect_uri=<encoded-uri>&scope=<encoded-scope>
  ```
  This is already configured in the code
- **Redirect URI uses 127.0.0.1**: The OAuth callback redirect must use `127.0.0.1`, not `localhost`

## How It Works

The app uses the official Bluesky OAuth library (`@atproto/oauth-client-node`) which implements the atproto OAuth specification:

1. User enters their Bluesky handle
2. App uses the handle to discover the user's authorization server (PDS - Personal Data Server)
3. User is redirected to their PDS authorization interface
4. User authenticates and grants permission
5. PDS redirects back with an authorization code
6. App exchanges the code for an access token (with DPoP proof - Demonstrating Proof-of-Possession)
7. App retrieves user's DID (Decentralized Identifier)
8. App resolves the DID document from the PLC directory to find the user's PDS URL
9. App queries the user's PDS to get their handle (username)
10. User information is stored in memory and in the session

**Key Technical Details:**
- Uses PKCE (Proof Key for Code Exchange) for security
- Implements DPoP (Demonstrating Proof-of-Possession) for token binding
- OAuth tokens are scoped to the user's PDS, not the public Bluesky AppView
- DID resolution is done via https://plc.directory
- The special `http://localhost` client_id format is only allowed for local development

## Endpoints

- `GET /` - Home page (shows handle input or user info)
- `POST /login` - Initiates OAuth flow with user's handle
- `GET /oauth/callback` - OAuth callback endpoint
- `POST /logout` - Logs out the user
- `GET /api/user` - Returns current user info (JSON)

## Storage

Currently, user data is stored in memory using a JavaScript Map. In a production environment, you should:

- Use a proper database (PostgreSQL, MongoDB, etc.)
- Encrypt sensitive data like access tokens
- Implement proper session storage (Redis, database-backed sessions)
- Use HTTPS and secure cookies

## Security Notes

For production use, you should:

1. **Deploy with HTTPS** - The `http://localhost` client_id only works for local development
2. **Use a real domain** - Your client_id must be `https://yourdomain.com/client-metadata.json`
3. **Host client metadata publicly** - Create a publicly accessible endpoint that serves your client metadata JSON
4. **Use proper client_id format** - Production client_id should be the full URL to your metadata, not the localhost query parameter format
5. **Use a database** - Replace in-memory storage with a proper database (PostgreSQL, MongoDB, etc.)
6. **Encrypt tokens** - Store access/refresh tokens encrypted at rest
7. **Implement token refresh** - The library handles this, but ensure proper error handling
8. **Add CSRF protection** - Use middleware like `csurf`
9. **Enable secure cookies** - Set `cookie.secure = true` in session config
10. **Implement rate limiting** - Protect against abuse
11. **Add proper logging** - Monitor OAuth flows for security issues
12. **Understand token scope** - OAuth tokens are for PDS access only, not for public AppView APIs

**Important OAuth Concepts:**
- **DPoP (Demonstrating Proof-of-Possession)**: The official library handles this automatically. It binds tokens to cryptographic keys to prevent token theft
- **PKCE (Proof Key for Code Exchange)**: Also handled by the library. Protects against authorization code interception
- **Token Scope**: OAuth tokens grant access to the user's PDS, not the public Bluesky services. Use unauthenticated requests for public data.

## Development

To run with auto-restart on file changes:

```bash
npm run dev
```

## Troubleshooting

**"Invalid client ID" error:**
- Make sure you're using the special localhost format with query parameters for the client_id
- The format should be: `http://localhost?redirect_uri=...&scope=...`

**"Use of localhost hostname is not allowed" error:**
- Ensure your redirect_uri uses `127.0.0.1`, not `localhost`
- Access the app via `http://127.0.0.1:3000`, not `http://localhost:3000`

**"Invalid scope" error:**
- The scope must be declared in the client metadata
- Use `atproto transition:generic` for full access

**"OAuth tokens are meant for PDS access only" error:**
- Don't try to use OAuth tokens to access the public Bluesky AppView (`https://bsky.social`)
- OAuth tokens are for accessing the user's PDS only
- For public data, use unauthenticated requests to the AppView

**Can't resolve handle:**
- The handle is fetched from the user's PDS, which is found via DID resolution
- The DID document is retrieved from `https://plc.directory/{did}`
- Ensure your app can access both the PLC directory and the user's PDS

## Environment Variables (Optional)

For production, create a `.env` file:

```
PORT=3000
SESSION_SECRET=your-strong-random-secret
CLIENT_ID=https://yourdomain.com/client-metadata.json
CLIENT_URI=https://yourdomain.com
REDIRECT_URI=https://yourdomain.com/oauth/callback
```

Remember: `http://localhost` is only for local development!

## License

MIT

## Resources

- [AT Protocol OAuth Specification](https://atproto.com/specs/oauth)
- [Bluesky OAuth Documentation](https://docs.bsky.app/docs/advanced-guides/oauth-client)
- [OAuth Client Node Package](https://www.npmjs.com/package/@atproto/oauth-client-node)
- [PLC Directory](https://plc.directory) - For DID resolution
- [AT Protocol Guide](https://atproto.com/guides/oauth)

## Common Questions

**Q: Why use 127.0.0.1 instead of localhost?**
A: RFC 8252 (OAuth for Native Apps) requires loopback IP addresses in redirect URIs to prevent DNS rebinding attacks. The special `http://localhost` client_id is an exception for development only.

**Q: Can I use this in production?**
A: The current setup is for development only. For production, you need to:
- Deploy to a real domain with HTTPS
- Host client metadata at a public URL
- Use a database for session/state storage
- Remove the localhost-specific client_id format

**Q: Why can't I access Bluesky APIs with the OAuth token?**
A: OAuth tokens in ATProto are scoped to the user's PDS (Personal Data Server), not the public Bluesky AppView. For public data, make unauthenticated requests to `https://public.api.bsky.app`.
