const crypto = require('crypto');

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/admin/login');
  if (req.session.user.must_change_password
      && !req.path.startsWith('/change-password') && req.path !== '/logout') {
    return res.redirect('/admin/change-password');
  }
  next();
}

function requireMaster(req, res, next) {
  if (!req.session.user) return res.redirect('/admin/login');
  if (req.session.user.role !== 'master') return res.status(403).send('Forbidden — master access only.');
  next();
}

function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(16).toString('hex');
  return req.session.csrf;
}

function checkCsrf(req, res, next) {
  const sent = (req.body && req.body.csrf) || (req.query && req.query.csrf);
  if (!sent || sent !== req.session.csrf) return res.status(400).send('Invalid request token.');
  next();
}

module.exports = { requireLogin, requireMaster, csrfToken, checkCsrf };
