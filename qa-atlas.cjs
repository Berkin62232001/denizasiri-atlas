const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {JSDOM} = require('./qa/node_modules/jsdom');
const modules = ['atlas-bootstrap','history-en','map-en','language','history','map','province-layer','compare','ui'];

function loadAtlas(html, options = {}) {
  const dom = new JSDOM(html,{...options,runScripts:'outside-only'});
  const {document} = dom.window;
  assert.equal(document.querySelectorAll('script').length,2);
  assert.equal(document.querySelectorAll('script[type="application/json"]#atlas-payload').length,1);
  // Only source modules from this checkout execute. Generated HTML supplies data.
  for (const name of modules) dom.window.eval(fs.readFileSync(path.join(__dirname,name+'.js'),'utf8'));
  return dom;
}
module.exports = {loadAtlas};
