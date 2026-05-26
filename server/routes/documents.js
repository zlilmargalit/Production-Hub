const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
} = require('docx');

const DATA_FILE = path.join(__dirname, '../data/shows.json');

const readShows = () => {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
};

function field(label, value) {
  return new Paragraph({
    bidirectional: true,
    spacing: { after: 120 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22 }),
      new TextRun({ text: value || '-', size: 22 }),
    ],
    alignment: AlignmentType.RIGHT,
  });
}

function sectionHeader(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    alignment: AlignmentType.RIGHT,
    bidirectional: true,
    spacing: { before: 240, after: 120 },
  });
}

router.get('/:id', async (req, res) => {
  const show = readShows().find((s) => s.id === req.params.id);
  if (!show) return res.status(404).json({ error: 'Show not found' });

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('he-IL') : '-');

  const taskItems = (show.tasks || []).map(
    (t) =>
      new Paragraph({
        text: `${t.completed ? '✓' : '○'}  ${t.text}`,
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: `${t.completed ? '✓' : '○'}  ${t.text}`,
            size: 22,
            color: t.completed ? '888888' : '000000',
          }),
        ],
      })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: `דף תיאום — ${show.name}`,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.RIGHT,
            bidirectional: true,
            spacing: { after: 240 },
          }),
          sectionHeader('פרטי האירוע'),
          field('תאריך', formatDate(show.date)),
          field('סוג אירוע', show.eventType),
          field('מקום', show.venue),
          field('כתובת', show.address),
          field('חניה', show.parking),
          field('איש קשר מקום', show.venueContact),
          field('צוות טכני', show.technicalCrew),
          field('הסעה', show.transportation),
          field('אוכל', show.food),
          field('אנשי קשר', show.contacts),
          sectionHeader('לוז'),
          new Paragraph({
            text: show.schedule || '-',
            alignment: AlignmentType.RIGHT,
            bidirectional: true,
            spacing: { after: 120 },
          }),
          sectionHeader('פרטים נוספים'),
          new Paragraph({
            text: show.additionalDetails || '-',
            alignment: AlignmentType.RIGHT,
            bidirectional: true,
            spacing: { after: 240 },
          }),
          sectionHeader('משימות'),
          ...(taskItems.length > 0
            ? taskItems
            : [
                new Paragraph({
                  text: 'אין משימות',
                  alignment: AlignmentType.RIGHT,
                  bidirectional: true,
                }),
              ]),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = encodeURIComponent(`תיאום-${show.name}.docx`);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
  res.send(buffer);
});

module.exports = router;
