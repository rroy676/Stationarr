const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { mergeXMLTV } = require('../src/utils/xmltv-merge');

async function makeDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'stationarr-xmltv-merge-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

function xmltvBody(channelId, programmeCount, title = 'Show') {
  const channel = `<channel id="${channelId}"><display-name>${channelId}</display-name></channel>`;
  const programmes = Array.from({ length: programmeCount }, (_, index) =>
    `<programme channel="${channelId}" start="20260901000000 +0000" stop="20260901010000 +0000"><title>${title} ${index}</title></programme>`
  ).join('');
  return channel + programmes;
}

function xmltv(channelId, programmeCount, title = 'Show') {
  return `<tv>${xmltvBody(channelId, programmeCount, title)}</tv>`;
}

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

test('merges a large source without a call stack overflow or programme cap', async (t) => {
  const directory = await makeDirectory(t);
  const file = path.join(directory, 'large.xml');
  const programmeCount = 120000;
  await fs.writeFile(file, xmltv('large', programmeCount));

  const output = await mergeXMLTV([file], new Set(['large']));
  assert.match(output, /<channel id="large">/);
  assert.equal(countOccurrences(output, '<programme '), programmeCount);
});

test('merges multiple sources and keeps channels unique', async (t) => {
  const directory = await makeDirectory(t);
  const first = path.join(directory, 'first.xml');
  const second = path.join(directory, 'second.xml');
  await fs.writeFile(first, xmltv('one', 2, 'First'));
  await fs.writeFile(second, `<tv>${xmltvBody('one', 1, 'Duplicate')}<channel id="two"><display-name>two</display-name></channel><programme channel="two"><title>Second</title></programme></tv>`);

  const output = await mergeXMLTV([first, second], new Set(['one', 'two']));
  assert.equal(countOccurrences(output, '<channel id="one">'), 1);
  assert.equal(countOccurrences(output, '<channel id="two">'), 1);
  assert.equal(countOccurrences(output, '<programme '), 4);
  assert.match(output, /<title>First 0<\/title>/);
  assert.match(output, /<title>Second<\/title>/);
});

test('skips malformed sources while preserving valid merged XMLTV data', async (t) => {
  const directory = await makeDirectory(t);
  const valid = path.join(directory, 'valid.xml');
  const malformed = path.join(directory, 'malformed.xml');
  await fs.writeFile(valid, xmltv('valid', 1));
  await fs.writeFile(malformed, '<tv><channel id="broken"><display-name>Broken</tv>');

  const output = await mergeXMLTV([malformed, valid], new Set(['valid']));
  assert.match(output, /<channel id="valid">/);
  assert.equal(countOccurrences(output, '<programme '), 1);
  assert.doesNotMatch(output, /broken/);
});

test('preserves normal small XMLTV output and filtering', async (t) => {
  const directory = await makeDirectory(t);
  const file = path.join(directory, 'small.xml');
  await fs.writeFile(file, `<tv>${xmltvBody('wanted', 1)}${xmltvBody('unwanted', 1)}</tv>`);

  const output = await mergeXMLTV([file], new Set(['wanted']));
  assert.match(output, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(output, /<channel id="wanted">/);
  assert.doesNotMatch(output, /unwanted/);
  assert.equal(countOccurrences(output, '<programme '), 1);
  assert.match(output, /<\/tv>$/);
});
