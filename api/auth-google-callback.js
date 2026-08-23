const router = require('./system.js');

module.exports = (req, res) => {
  req.query = Object.assign({}, req.query || {}, { action: 'email-callback' });
  return router(req, res);
};
