const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, '../data/crew.json');

const readCrew = () => {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
};

const writeCrew = (crew) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(crew, null, 2));
};

router.get('/', (req, res) => res.json(readCrew()));

router.post('/', (req, res) => {
  const crew = readCrew();
  const member = { id: uuidv4(), ...req.body };
  crew.push(member);
  writeCrew(crew);
  res.status(201).json(member);
});

router.put('/:id', (req, res) => {
  const crew = readCrew();
  const idx = crew.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  crew[idx] = { ...crew[idx], ...req.body };
  writeCrew(crew);
  res.json(crew[idx]);
});

router.delete('/:id', (req, res) => {
  writeCrew(readCrew().filter((m) => m.id !== req.params.id));
  res.status(204).send();
});

module.exports = router;
