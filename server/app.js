import express from 'express';
import path, { dirname } from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import sessions from 'express-session';
import { fileURLToPath } from 'url';

import WebAppAuthProvider from 'msal-node-wrapper';
import { requireAzureLogin } from './middleware/auth.js';
import dotenv from "dotenv";
dotenv.config();


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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// Serve static frontend
app.use(express.static(path.join(__dirname, '../client')));


// ---------- Azure Auth (MSAL) ----------
const authProvider = await WebAppAuthProvider.WebAppAuthProvider.initialize(authConfig);

// This wires up authentication & redirect handling
app.use(authProvider.authenticate());

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

  return req.authContext.login({
    postLoginRedirectUri: redirect,
  })(req, res, next);
});



app.get('/signout', (req, res, next) => {
  return req.authContext.logout({
    postLogoutRedirectUri: "/",
  })(req, res, next);
});


app.get('/instructor.html', requireAzureLogin, (req, res) => {
  res.sendFile(path.join(__dirname, '../client', 'instructor.html'));
});

app.get('/studentJoin.html', requireAzureLogin, (req, res) => {
  res.sendFile(path.join(__dirname, '../client', 'studentJoin.html'));
});

// start the login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client', 'login.html'));
});


// Handles Azure / MSAL interaction errors
app.use(authProvider.interactionErrorHandler());


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});


export default app;
