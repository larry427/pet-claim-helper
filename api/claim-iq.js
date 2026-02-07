module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send('<h1>Pet Claim IQ works!</h1>');
};
