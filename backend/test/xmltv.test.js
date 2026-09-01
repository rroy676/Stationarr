const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const { parseXMLTV, parseXMLTVBuffer, parseXMLTVFile } = require('../src/utils/xmltv');
const { countProgrammeEntriesFromBuffer } = require('../src/utils/xmltv-programme-count');

const channelTags = [
  '<channel id="one"><display-name>One</display-name></channel>',
  '<channel  id="two"><display-name>Two</display-name></channel>',
  '<channel     id="three"><display-name>Three</display-name></channel>',
  '<channel id = "four"><display-name>Four</display-name></channel>',
  '<channel\n  id="five"><display-name>Five</display-name></channel>',
];
const programmes = Array.from({ length: 250 }, (_, index) =>
  `<programme channel="${channelTags[index % channelTags.length] ? (index % 5) + 1 : 1}"><title>Show ${index}</title></programme>`
);
const document = `<?xml version="1.0"?><tv>${channelTags.join('')}${programmes.join('')}</tv>`;

test('all parsing paths accept legal channel attribute whitespace', async (t) => {
  const expectedIds = ['one', 'two', 'three', 'four', 'five'];
  assert.deepEqual(parseXMLTV(document).map(({ id }) => id), expectedIds);
  assert.deepEqual((await parseXMLTVBuffer(Buffer.from(document))).map(({ id }) => id), expectedIds);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'stationarr-xmltv-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'guide.xml');
  await fs.writeFile(file, document);
  assert.deepEqual((await parseXMLTVFile(file)).map(({ id }) => id), expectedIds);
});

test('many programmes do not affect channels and programme counting remains correct', async () => {
  const manyChannels = Array.from({ length: 300 }, (_, index) =>
    `<channel\n id = "channel-${index}"><display-name>Channel ${index}</display-name></channel>`
  );
  const realisticDocument = `<tv>${manyChannels.join('')}${programmes.join('')}</tv>`;
  const buffer = Buffer.from(realisticDocument);
  const parsed = await parseXMLTVBuffer(buffer);
  assert.equal(parsed.length, manyChannels.length);
  assert.equal(parsed.at(-1).id, 'channel-299');
  assert.equal(countProgrammeEntriesFromBuffer(buffer), programmes.length);
});

test('buffer and file parsing retain gzip support', async (t) => {
  const compressed = zlib.gzipSync(document);
  assert.equal((await parseXMLTVBuffer(compressed)).length, channelTags.length);
  assert.equal(countProgrammeEntriesFromBuffer(compressed), programmes.length);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'stationarr-xmltv-gzip-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'upload.tmp');
  await fs.writeFile(file, compressed);
  assert.equal((await parseXMLTVFile(file)).length, channelTags.length);
});

test('malformed XML rejects with a useful parser error', async () => {
  const usefulError = /Invalid XMLTV data:[\s\S]*line/i;
  assert.throws(() => parseXMLTV('<tv><channel id="broken"></tv>'), usefulError);
  await assert.rejects(parseXMLTVBuffer(Buffer.from('<tv><channel id="broken"></tv>')), usefulError);
});
