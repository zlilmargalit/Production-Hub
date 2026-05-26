const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../data/field-templates.json');
const read = () => (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {});
const write = (d) => fs.writeFileSync(FILE, JSON.stringify(d, null, 2));

// GET /api/field-templates
router.get('/', (req, res) => res.json(read()));

// PUT /api/field-templates/:eventType  — body is array of field definitions
router.put('/:eventType', (req, res) => {
  const et = decodeURIComponent(req.params.eventType);
  const d = read();
  d[et] = req.body; // array of { id, label, type }
  write(d);
  res.json(d[et]);
});

module.exports = router;
