const express = require('express');
const router = express.Router();
const path = require('path');

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/index.html'));
});

router.get('/spaceshooter', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/spaceshooter.html'));
});

module.exports = router; 