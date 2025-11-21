import express from 'express';
import path, { dirname } from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import sessions from 'express-session';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import WebAppAuthProvider from 'msal-node-wrapper';
import { requireAzureLogin } from './middleware/auth.js';
import classroomRoutes from './routes/classroom.js';
import codeRoutes from './routes/code.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

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
    authority: "https://login.microsoftonline.com/f6b6dd5b-f02f-441a-99a0-162ac5060bd2",
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
  app.use(authProvider.authenticate());
}

// Serve static frontend
app.use(express.static(path.join(__dirname, '../client')));

// ---------- API Routes ----------
app.use('/api/classrooms', requireAzureLogin, classroomRoutes);
app.use('/api/code', requireAzureLogin, codeRoutes);

// ---------- Routes for Sign In / Sign Out ----------

app.get('/signin', (req, res, next) => {
  const role = req.query.role;
  let redirect = '/'; // fallback

  if (role === 'instructor') {
    redirect = '/instructor.html';
  } else if (role === 'student') {
    redirect = '/studentJoin.html';
  }

  console.log(`Selected role: ${role}, postLoginRedirectUri: ${redirect}`);

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

app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});


export default app;
