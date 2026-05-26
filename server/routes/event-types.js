const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/event-types.json');

const read = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const write = (d) => fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));

router.get('/', (req, res) => res.json(read()));

// Full replace (client sends the ordered array)
router.put('/', (req, res) => {
  const types = req.body;
  if (!Array.isArray(types)) return res.status(400).json({ error: 'Expected array' });
  write(types);
  res.json(types);
});

module.exports = router;
