const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/templates.json');
const CREW_FILE = path.join(__dirname, '../data/crew.json');

const readTemplates = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeTemplates = (t) => fs.writeFileSync(DATA_FILE, JSON.stringify(t, null, 2));
const readCrew = () => JSON.parse(fs.readFileSync(CREW_FILE, 'utf8'));

router.get('/', (req, res) => res.json(readTemplates()));

router.put('/:eventType', (req, res) => {
  const templates = readTemplates();
  const eventType = decodeURIComponent(req.params.eventType);
  templates[eventType] = req.body.crewIds || [];
  writeTemplates(templates);
  res.json({ eventType, crewIds: templates[eventType] });
});

// Returns the formatted technicalCrew string for an event type
router.get('/:eventType/text', (req, res) => {
  const templates = readTemplates();
  const crew = readCrew();
  const eventType = decodeURIComponent(req.params.eventType);
  const ids = templates[eventType] || [];
  const text = ids
    .map((id) => crew.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => `${m.role} – ${m.name}`)
    .join(' | ');
  res.json({ text, crewIds: ids });
});

module.exports = router;
