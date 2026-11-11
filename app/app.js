/**
 * Vipra Realty — admin panel + API (Express + MySQL)
 * Startup file for Hostinger's Node.js app setup.
 * Hostinger/Passenger sets process.env.PORT; locally it defaults to 3000.
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
  name: 'vr_sid',
  secret: process.env.SESSION_SECRET || 'please-change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
}));

// trust the Hostinger/Passenger proxy so secure cookies & protocol work
app.set('trust proxy', 1);

app.use('/admin', require('./routes/admin'));
app.use('/api', require('./routes/api'));

// public website (static) served at the web root
app.use(express.static(path.join(__dirname, 'site')));

app.use((req, res) => res.status(404).send('Not found'));

// Central error handler — keeps the app alive if a route throws
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  const json = req.path.startsWith('/api');
  res.status(500)[json ? 'json' : 'send'](json ? { error: 'Server error' } : 'Server error');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Vipra Realty admin running on port ' + PORT));
