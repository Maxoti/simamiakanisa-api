module.exports = function (req, res, next) {
  const { recipients, message } = req.body;

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'Invalid recipients' });
  }

  if (typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Invalid message' });
  }

  if (message.length > 500) {
    return res.status(400).json({ error: 'Message too long' });
  }

  next();
};