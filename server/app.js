import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file only if it exists (for local development)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const dotenv = await import('dotenv');
  dotenv.config({ path: envPath });
  console.log('Loaded .env file for local development');
} else {
  console.log('No .env file found, using environment variables from Azure');
}

import express from 'express';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import sessions from 'express-session';
import mongoose from 'mongoose';
import { createServer } from 'http';

import WebAppAuthProvider from 'msal-node-wrapper';
import { requireAzureLogin } from './middleware/auth.js';
import classroomRoutes from './routes/classroom.js';
import codeRoutes from './routes/code.js';
import executeRoutes from './routes/execute.js';
import { initializeSocket } from './socket.js';

const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/codeshare_classroom';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });


const authConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: "https://login.microsoftonline.com/common",
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    redirectUri: "/redirect",
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
        console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: 3,
    }
  }
};

const app = express();

// ---------- Sessions ----------
const oneDay = 1000 * 60 * 60 * 24;
app.use(
  sessions({
    secret: "This is some secret key I am making up 05n5yf5398hoiueneue",
    saveUninitialized: true,
    cookie: { maxAge: oneDay },
    resave: false,
  })
);

app.enable('trust proxy')


app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const DEV_BYPASS_AUTH =
  process.env.DEV_BYPASS_AUTH === '1' || process.env.DEV_BYPASS_AUTH === 'true';

// ---------- Azure Auth (MSAL) / Dev bypass ----------
let authProvider;

if (DEV_BYPASS_AUTH) {
  console.log('Dev bypass auth enabled. req.authContext will be mocked.');
  app.use((req, _res, next) => {
    const role = req.session?.devRole || 'instructor';
    const isStudent = role === 'student';
    const oid = isStudent ? 'dev-student-oid' : 'dev-instructor-oid';
    req.authContext = {
      account: {
        idTokenClaims: { oid, sub: oid },
        name: isStudent ? 'Dev Student' : 'Dev Instructor',
        username: isStudent ? 'student@example.com' : 'instructor@example.com',
        role,
      },
    };
    next();
  });
} else {
  authProvider = await WebAppAuthProvider.WebAppAuthProvider.initialize(authConfig);
  // This wires up authentication & redirect handling
  // IMPORTANT: Pass empty config to ensure authentication state is properly maintained
  app.use(authProvider.authenticate({
    protectAllRoutes: false
  }));

  app.use((req, _res, next) => {
    console.log('=== Custom Account Population Middleware ===');
    console.log('Path:', req.path);
    console.log('Has authContext:', !!req.authContext);
    console.log('Has account in authContext:', !!req.authContext?.account);
    console.log('Has account in session:', !!req.session?.account);

    // If MSAL just authenticated and set account, save it to session
    if (req.authContext?.account && !req.session?.account) {
      console.log('MSAL just authenticated - saving account to session');
      req.session.account = req.authContext.account;
      console.log('Account saved to session:', req.authContext.account.username);
    }
    // If no account in authContext but we have one in session, restore it
    else if (req.authContext && !req.authContext.account && req.session?.account) {
      console.log('Restoring account from session');
      req.authContext.account = req.session.account;
      console.log('Account restored:', req.authContext.account.username);
    }
    // If both have accounts, keep them in sync
    else if (req.authContext?.account && req.session?.account) {
      // Check if they're different (user logged in as different account)
      const currentUsername = req.authContext.account.username;
      const sessionUsername = req.session.account.username;
      if (currentUsername !== sessionUsername) {
        console.log(`Account changed: ${sessionUsername} -> ${currentUsername}`);
        req.session.account = req.authContext.account;
        console.log('Updated session with new account');
      }
    }

    next();
  });
}

// Serve static frontend
app.use(express.static(path.join(__dirname, '../client')));

// ---------- API Routes ----------
app.use('/api/classrooms', requireAzureLogin, classroomRoutes);
app.use('/api/code', requireAzureLogin, codeRoutes);
app.use('/api/execute', requireAzureLogin, executeRoutes);

// ---------- Routes for Sign In / Sign Out ----------

// Custom handler to capture account after successful MSAL redirect
app.use('/redirect', (req, _res, next) => {
  console.log('=== Redirect Handler ===');
  console.log('Path:', req.path);
  console.log('Query:', req.query);

  // MSAL will process this in the authenticate middleware,
  // account will be available after that
  next();
});

// Add another middleware AFTER redirect to capture the account
app.post('/redirect', (req, _res, next) => {
  console.log('=== Post-Redirect Account Capture ===');
  console.log('authContext:', req.authContext);
  console.log('account:', req.authContext?.account);

  // At this point, MSAL should have populated the account
  if (req.authContext?.account) {
    req.session.account = req.authContext.account;
    console.log('Saved account to session:', req.authContext.account.username);
  } else {
    console.log('No account found in authContext after redirect');
  }

  next();
});

app.get('/signin', (req, res, next) => {
  const role = req.query.role;
  let redirect = '/'; // fallback

  if (role === 'instructor') {
    redirect = '/instructor.html';
  } else if (role === 'student') {
    redirect = '/studentJoin.html';
  }

  console.log(`Selected role: ${role}, postLoginRedirectUri: ${redirect}`);

  // Store pending role in session so we know which role to associate with after login
  if (role) {
    req.session.pendingRole = role;
  }

  // In dev bypass mode, skip MSAL and just jump to the page
  if (DEV_BYPASS_AUTH) {
    if (req.session) {
      req.session.devRole = role || 'instructor';
    }
    return res.redirect(redirect);
  }

  return req.authContext.login({
    postLoginRedirectUri: redirect,
  })(req, res, next);
});



app.get('/signout', (req, res, next) => {
  if (DEV_BYPASS_AUTH) {
    return res.redirect('/');
  }

  return req.authContext.logout({
    postLogoutRedirectUri: "/",
  })(req, res, next);
});

// start the login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client', 'login.html'));
});


// Handles Azure / MSAL interaction errors
if (authProvider) {
  app.use(authProvider.interactionErrorHandler());
}


const PORT = process.env.PORT || 3000;

// Create HTTP server and initialize Socket.IO
const httpServer = createServer(app);
initializeSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});

export default app;
