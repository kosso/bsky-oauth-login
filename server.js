const express = require('express');
const session = require('express-session');
const { NodeOAuthClient } = require('@atproto/oauth-client-node');
const { AtpAgent } = require('@atproto/api');

const app = express();
const PORT = 3000;

// In-memory storage for user identities (in production, use a database)
const users = new Map();

// Session configuration
app.use(session({
  secret: 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// For local development, use the special 'http://localhost' client_id
// with redirect_uri and scope as query parameters (required for localhost)
const REDIRECT_URI = 'http://127.0.0.1:3000/oauth/callback';
const SCOPE = 'atproto transition:generic';

const CLIENT_METADATA = {
  client_id: `http://localhost?redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPE)}`,
  client_name: 'Bluesky Sign-In Demo',
  client_uri: 'http://localhost:3000',
  redirect_uris: [REDIRECT_URI],
  scope: SCOPE,
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  application_type: 'web',
  dpop_bound_access_tokens: true
};

// Simple state store for OAuth (in-memory)
class StateStore {
  constructor() {
    this.states = new Map();
  }

  async set(key, state) {
    this.states.set(key, { state, createdAt: Date.now() });
    // Clean up old states (older than 10 minutes)
    for (const [k, v] of this.states.entries()) {
      if (Date.now() - v.createdAt > 600000) {
        this.states.delete(k);
      }
    }
  }

  async get(key) {
    const entry = this.states.get(key);
    return entry ? entry.state : undefined;
  }

  async del(key) {
    this.states.delete(key);
  }
}

// Simple session store for OAuth
class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  async set(sub, session) {
    this.sessions.set(sub, session);
  }

  async get(sub) {
    return this.sessions.get(sub);
  }

  async del(sub) {
    this.sessions.delete(sub);
  }
}

const stateStore = new StateStore();
const sessionStore = new SessionStore();

// Initialize OAuth client
let oauthClient;

async function initOAuthClient() {
  try {
    oauthClient = new NodeOAuthClient({
      clientMetadata: CLIENT_METADATA,
      stateStore,
      sessionStore,
      // Use Bluesky's handle resolver
      handleResolver: 'https://bsky.social'
    });
    console.log('OAuth client initialized');
  } catch (error) {
    console.error('Failed to initialize OAuth client:', error);
    throw error;
  }
}

// Home page
app.get('/', async (req, res) => {
  if (req.session.userDid) {
    const user = users.get(req.session.userDid);
    if (user) {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Bluesky Sign-In Demo</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .user-info { background: #f0f0f0; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .post-form { background: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0; }
            button { padding: 10px 20px; font-size: 16px; cursor: pointer; background: #1185fe; color: white; border: none; border-radius: 4px; }
            button:hover { background: #0d6ecd; }
            button.secondary { background: #6c757d; margin-left: 10px; }
            button.secondary:hover { background: #5a6268; }
            pre { background: #f8f8f8; padding: 10px; border-radius: 4px; overflow-x: auto; }
            textarea { width: 100%; padding: 10px; font-size: 14px; font-family: Arial, sans-serif; border: 1px solid #ccc; border-radius: 4px; resize: vertical; box-sizing: border-box; }
            .char-count { text-align: right; font-size: 12px; color: #666; margin-top: 5px; }
            .success { background: #d4edda; color: #155724; padding: 10px; border-radius: 4px; margin: 10px 0; }
            .error { background: #f8d7da; color: #721c24; padding: 10px; border-radius: 4px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <h1>Welcome!</h1>
          <div class="user-info">
            <h2>Signed in as:</h2>
            ${user.avatar ? `<img src="${user.avatar}" alt="Avatar" style="width: 80px; height: 80px; border-radius: 40px; margin: 10px 0;">` : ''}
            ${user.displayName ? `<p><strong>Display Name:</strong> ${user.displayName}</p>` : ''}
            <p><strong>Handle:</strong> ${user.handle || 'N/A'}</p>
            <p><strong>DID:</strong> ${user.did}</p>
            ${user.description ? `<p><strong>Bio:</strong> ${user.description}</p>` : ''}
            <h3>Full Profile Data:</h3>
            <pre>${JSON.stringify(user, null, 2)}</pre>
          </div>
          
          <div class="post-form">
            <h2>Create a Test Post</h2>
            <form action="/post" method="POST">
              <textarea name="text" id="postText" rows="4" maxlength="300" placeholder="What's on your mind?" required></textarea>
              <div class="char-count"><span id="charCount">0</span> / 300</div>
              <button type="submit">Post to Bluesky</button>
            </form>
          </div>
          
          <form action="/logout" method="POST">
            <button type="submit" class="secondary">Sign Out</button>
          </form>
          
          <script>
            const textarea = document.getElementById('postText');
            const charCount = document.getElementById('charCount');
            textarea.addEventListener('input', function() {
              charCount.textContent = this.value.length;
            });
          </script>
        </body>
        </html>
      `);
      return;
    }
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bluesky Sign-In Demo</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
        button { padding: 10px 20px; font-size: 16px; cursor: pointer; background: #1185fe; color: white; border: none; border-radius: 4px; }
        button:hover { background: #0d6ecd; }
        .info { background: #f0f0f0; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: left; }
        input { width: 100%; padding: 10px; margin: 10px 0; font-size: 16px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
      </style>
    </head>
    <body>
      <h1>Bluesky Sign-In Demo</h1>
      <div class="info">
        <p>This demo app shows how to authenticate users with their Bluesky account using OAuth.</p>
        <p>Enter your Bluesky handle below to sign in.</p>
      </div>
      <form action="/login" method="POST">
        <input type="text" name="handle" placeholder="example.bsky.social" required />
        <button type="submit">Sign in with Bluesky</button>
      </form>
    </body>
    </html>
  `);
});

// Initiate OAuth login
app.post('/login', async (req, res) => {
  try {
    const { handle } = req.body;
    
    if (!handle) {
      return res.status(400).send('Handle is required');
    }

    // Create authorization URL - scope is taken from client metadata
    const url = await oauthClient.authorize(handle);

    res.redirect(url.toString());
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Error</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .error { background: #fee; padding: 20px; border-radius: 8px; border: 1px solid #fcc; }
          a { color: #1185fe; }
        </style>
      </head>
      <body>
        <h1>Authentication Error</h1>
        <div class="error">
          <p><strong>Error:</strong> ${error.message}</p>
        </div>
        <p><a href="/">← Back to home</a></p>
      </body>
      </html>
    `);
  }
});

// OAuth callback
app.get('/oauth/callback', async (req, res) => {
  try {
    console.log('Callback received with query:', req.url);
    
    // Get the full query string from the request
    const params = new URLSearchParams(req.url.split('?')[1]);
    
    console.log('Parsed params:', Object.fromEntries(params));
    
    // Complete the OAuth flow
    console.log('Calling oauthClient.callback...');
    const result = await oauthClient.callback(params);
    
    console.log('Callback result received');
    
    // Get the session
    const { session } = result;
    const did = session.did;
    
    console.log('Session DID:', did);

    // Get the handle - need to resolve the DID to find the PDS
    let handle = did;
    
    try {
      // First, resolve the DID document to find the user's PDS
      const didDocUrl = `https://plc.directory/${did}`;
      console.log('Fetching DID document from:', didDocUrl);
      
      const didDocResponse = await fetch(didDocUrl);
      if (didDocResponse.ok) {
        const didDoc = await didDocResponse.json();
        
        // Find the PDS service endpoint
        const pdsService = didDoc.service?.find(s => s.id === '#atproto_pds');
        const pdsUrl = pdsService?.serviceEndpoint;
        
        console.log('User PDS URL:', pdsUrl);
        
        if (pdsUrl) {
          // Now fetch the repo info from the user's PDS
          const repoUrl = `${pdsUrl}/xrpc/com.atproto.repo.describeRepo?repo=${did}`;
          console.log('Fetching repo info from:', repoUrl);
          
          const repoResponse = await session.fetchHandler(repoUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          if (repoResponse.ok) {
            const repoData = await repoResponse.json();
            handle = repoData.handle || did;
            console.log('Resolved handle:', handle);
          } else {
            const errorText = await repoResponse.text();
            console.log('Repo fetch failed:', repoResponse.status, errorText);
          }
        }
      }
    } catch (err) {
      console.log('Could not resolve DID to handle:', err.message);
    }

    // Fetch full profile data from public API (including avatar)
    let profileData = null;
    try {
      const profileUrl = `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${did}`;
      console.log('Fetching profile from public API:', profileUrl);
      
      const profileResponse = await fetch(profileUrl);
      if (profileResponse.ok) {
        profileData = await profileResponse.json();
        console.log('Profile data fetched:', profileData.handle, profileData.avatar);
        
        // Update handle from profile if we got it
        if (profileData.handle) {
          handle = profileData.handle;
        }
      }
    } catch (err) {
      console.log('Could not fetch profile data:', err.message);
    }

    // Store user information
    const userData = {
      did: did,
      handle: handle,
      displayName: profileData?.displayName || null,
      avatar: profileData?.avatar || null,
      description: profileData?.description || null,
      signedInAt: new Date().toISOString()
    };

    users.set(did, userData);
    req.session.userDid = did;

    console.log('User signed in:', { handle, did });

    res.redirect('/');
  } catch (error) {
    console.error('Callback error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Error</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .error { background: #fee; padding: 20px; border-radius: 8px; border: 1px solid #fcc; }
          a { color: #1185fe; }
          pre { background: #f8f8f8; padding: 10px; overflow-x: auto; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>Authentication Error</h1>
        <div class="error">
          <p><strong>Error:</strong> ${error.message}</p>
          <p>Please try again.</p>
          <details>
            <summary>Error details</summary>
            <pre>${error.stack || 'No stack trace available'}</pre>
          </details>
        </div>
        <p><a href="/">← Back to home</a></p>
      </body>
      </html>
    `);
  }
});

// Create a post
app.post('/post', async (req, res) => {
  if (!req.session.userDid) {
    return res.redirect('/');
  }

  try {
    const { text } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.redirect('/?error=empty');
    }

    const user = users.get(req.session.userDid);
    if (!user) {
      return res.redirect('/');
    }

    // Restore the OAuth session using the client
    const oauthSession = await oauthClient.restore(user.did);
    
    if (!oauthSession) {
      return res.redirect('/?error=session_expired');
    }

    // Get the PDS URL from the session
    let pdsUrl = oauthSession.pdsUrl;
    
    // If not available, resolve it from the DID
    if (!pdsUrl) {
      const didDocUrl = `https://plc.directory/${user.did}`;
      const didDocResponse = await fetch(didDocUrl);
      
      if (!didDocResponse.ok) {
        throw new Error('Failed to resolve DID');
      }
      
      const didDoc = await didDocResponse.json();
      const pdsService = didDoc.service?.find(s => s.id === '#atproto_pds');
      pdsUrl = pdsService?.serviceEndpoint;
      
      if (!pdsUrl) {
        throw new Error('PDS URL not found');
      }
    }

    // Create the post record
    const now = new Date().toISOString();
    const post = {
      $type: 'app.bsky.feed.post',
      text: text.trim(),
      createdAt: now,
    };

    // Create the post using the authenticated session
    const createRecordUrl = `${pdsUrl}/xrpc/com.atproto.repo.createRecord`;
    
    const response = await oauthSession.fetchHandler(createRecordUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: user.did,
        collection: 'app.bsky.feed.post',
        record: post,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to create post:', response.status, errorText);
      throw new Error(`Failed to create post: ${response.status}`);
    }

    const result = await response.json();
    console.log('Post created:', result);

    // Redirect back with success message
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Post Created!</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .success { background: #d4edda; color: #155724; padding: 20px; border-radius: 8px; margin: 20px 0; }
          button { padding: 10px 20px; font-size: 16px; cursor: pointer; background: #1185fe; color: white; border: none; border-radius: 4px; }
          button:hover { background: #0d6ecd; }
          pre { background: #f8f8f8; padding: 10px; border-radius: 4px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <h1>Success!</h1>
        <div class="success">
          <p><strong>Your post has been created!</strong></p>
          <p>Post text: "${text.trim()}"</p>
          <h3>Response:</h3>
          <pre>${JSON.stringify(result, null, 2)}</pre>
        </div>
        <a href="/"><button>Back to Home</button></a>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .error { background: #f8d7da; color: #721c24; padding: 20px; border-radius: 8px; margin: 20px 0; }
          button { padding: 10px 20px; font-size: 16px; cursor: pointer; background: #1185fe; color: white; border: none; border-radius: 4px; }
          button:hover { background: #0d6ecd; }
        </style>
      </head>
      <body>
        <h1>Error</h1>
        <div class="error">
          <p><strong>Failed to create post:</strong></p>
          <p>${error.message}</p>
        </div>
        <a href="/"><button>Back to Home</button></a>
      </body>
      </html>
    `);
  }
});

// Logout
app.post('/logout', async (req, res) => {
  if (req.session.userDid) {
    const did = req.session.userDid;
    
    // Revoke the session if it exists
    try {
      await sessionStore.del(did);
    } catch (err) {
      console.error('Error deleting session:', err);
    }
    
    users.delete(did);
    req.session.destroy();
  }
  res.redirect('/');
});

// API endpoint to get current user
app.get('/api/user', (req, res) => {
  if (req.session.userDid) {
    const user = users.get(req.session.userDid);
    res.json(user || { error: 'User not found' });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Start server
async function start() {
  try {
    await initOAuthClient();
    app.listen(PORT, () => {
      console.log(`Server running at http://127.0.0.1:${PORT}`);
      console.log('Note: Access the app via http://127.0.0.1:3000 (not localhost)');
      console.log('The OAuth callback requires 127.0.0.1 per RFC 8252');
      console.log('Press Ctrl+C to stop');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();