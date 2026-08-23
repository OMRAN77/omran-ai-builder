const router = require('./account.js');

module.exports = (req, res) => {
  req.query = Object.assign({}, req.query || {}, { action: 'auth-google-callback' });
  return router(req, res);
};
