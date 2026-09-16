var express = require('express');
var router = express.Router();

router.get('/', function(req, res) {
  res.json({
    name: 'Somos Guaches API',
    status: 'ok',
  });
});

module.exports = router;
