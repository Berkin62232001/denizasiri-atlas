const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('../qa/node_modules/jsdom');
const work = path.resolve(__dirname, '..');
const read = filename => fs.readFileSync(path.join(work, filename), 'utf8');

const { window } = new JSDOM(`
  <svg id="map"></svg>
  <input id="modern-provinces" type="checkbox">
  <div id="province-search-box"><input id="province-search"></div>
  <datalist id="province-options"></datalist>
  <p id="province-error" hidden></p>
`, { runScripts: 'outside-only' });

const { document } = window;
const get = id => document.getElementById(id);
const load = name => window.eval(read(name + '.js'));
const encoded = (...bytes) => Buffer.from(bytes).toString('base64');
window.ATLAS_TERRAIN = { world: '' };
window.TextDecoder = TextDecoder;
load('history');
window.ATLAS_GEOGRAPHY = JSON.parse(read('geography.js').trim().replace(/^window\.ATLAS_GEOGRAPHY=/, '').replace(/;$/, ''));
load('map');
load('province-layer');

const actual = window.ATLAS_GEOGRAPHY;
const geography = { units: 20, arcCount: 1, arcs: encoded(1, 0, 0), countries: [['Test', [[0]]]], land: [[0]] };
for (const malformed of [
  { ...geography, arcs: encoded(1, 0) },
  { ...geography, arcs: encoded(1, 128, 128, 128, 128, 0) },
  { ...geography, arcs: encoded(1, 255, 255, 7, 0) },
  { ...geography, land: [[1]] }
]) {
  window.ATLAS_GEOGRAPHY = malformed;
  const map = new window.ColonialMap(get('map'));
  assert.equal(map.borderLayer.children.length, 0);
  assert.equal(map.landClip, 'none');
  assert.ok(map.active.has('lanzarote'));
}

window.ATLAS_GEOGRAPHY = actual;
const map = new window.ColonialMap(get('map'));
assert.ok(map.borderLayer.children.length > 200);
assert.notEqual(map.landClip, 'none');
window.installProvinceLayer(map);

const valid = ['Test', 'TR', 'Türkiye', encoded(3, 0, 0, 2, 0, 0, 2)];
const invalid = ['Truncated', 'TR', 'Türkiye', encoded(3, 0, 0)];
const invalidPosition = ['Position', 'TR', 'Türkiye', encoded(3, 255, 255, 7, 0, 0, 0, 0, 0)];
const settle = () => new Promise(resolve => setImmediate(resolve));
const toggle = get('modern-provinces');
const options = get('province-options');

(async () => {
  for (const rows of [[valid, invalid], [invalidPosition]]) {
    window.ATLAS_PROVINCES = rows;
    toggle.click();
    await settle();
    assert.equal(toggle.checked, false);
    assert.equal(get('province-error').hidden, false);
    assert.equal(options.children.length, 0);
  }

  delete window.ATLAS_PROVINCES;
  window.fetch = async resource => {
    assert.equal(resource, 'provinces.json');
    return new Response('incomplete JSON');
  };
  toggle.click();
  await settle();
  assert.equal(toggle.checked, false);
  assert.equal(options.children.length, 0);

  window.fetch = async () => new Response(read('dist/provinces.json'));
  toggle.click();
  await settle();
  assert.ok(toggle.checked);
  assert.ok(get('province-error').hidden);
  assert.ok(options.children.length > 4000);
  console.log('Malformed geometry stays isolated and actual geography and provinces still load.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => window.close());
