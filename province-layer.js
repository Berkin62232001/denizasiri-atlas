(() => {
  'use strict';

  const MAX_RESPONSE_BYTES = 1_500_000;
  const MAX_UNITS = 6500;
  const MAX_ENCODED_LENGTH = 32_000;
  const translate = value => window.atlasT?.(value) ?? value;
  const countryNames = {
    tr: new Intl.DisplayNames(['tr'], {type:'region'}),
    en: new Intl.DisplayNames(['en'], {type:'region'})
  };
  const english = () => document.documentElement.lang === 'en';

  function invalidProvinces() {
    throw new Error('Invalid province geography');
  }

  async function readProvinceResponse(response) {
    const declaredBytes = Number(response.headers.get('Content-Length'));
    if (!response.body) invalidProvinces();
    if (!response.ok || declaredBytes > MAX_RESPONSE_BYTES) {
      void response.body.cancel().catch(() => {});
      invalidProvinces();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let receivedBytes = 0;
    let complete = false;
    const chunks = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > MAX_RESPONSE_BYTES) invalidProvinces();
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode());
      complete = true;
      return JSON.parse(chunks.join(''));
    } finally {
      if (!complete) void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  // Each projected polygon ring starts with a vertex count and uses delta coordinates.
  function pathFor(encoded, budget) {
    if (typeof encoded !== 'string' || !encoded.length || encoded.length > MAX_ENCODED_LENGTH) invalidProvinces();
    budget.encoded += encoded.length;
    if (budget.encoded > MAX_RESPONSE_BYTES) invalidProvinces();
    const bytes = atob(encoded);
    if (!bytes.length) invalidProvinces();
    let index = 0;
    function unsigned() {
      let value = 0;
      for (let shift = 0; shift < 28 && index < bytes.length; shift += 7) {
        const byte = bytes.charCodeAt(index++);
        value += (byte & 127) * 2 ** shift;
        if (byte < 128) return value;
      }
      return invalidProvinces();
    }
    function delta() {
      const n = unsigned();
      return n & 1 ? -(n + 1) / 2 : n / 2;
    }
    const commands = [];
    while (index < bytes.length) {
      const count = unsigned();
      budget.points += count;
      if (count < 3 || count > 7500 || budget.points > 375_000 ||
          count > Math.floor((bytes.length - index) / 2)) invalidProvinces();
      let x = 0;
      let y = 0;
      for (let i = 0; i < count; i++) {
        x += delta();
        y += delta();
        if (x < -25 || x > 30_025 || y < -25 || y > 16_025) invalidProvinces();
        commands.push((i === 0 ? 'M' : 'L') + x / 25 + ',' + y / 25);
      }
      commands.push('Z');
    }
    return commands.join('');
  }

  window.installProvinceLayer = map => {
    const ns = 'http://www.w3.org/2000/svg';
    const toggle = document.getElementById('modern-provinces');
    const searchBox = document.getElementById('province-search-box');
    const search = document.getElementById('province-search');
    const options = document.getElementById('province-options');
    const layer = document.createElementNS(ns,'g');
    layer.id = 'province-shapes';
    layer.setAttribute('fill','transparent');
    layer.setAttribute('fill-rule','evenodd');
    map.scene.insertBefore(layer,map.territories);
    // Repeat the outlines above historic fills; the original shapes receive pointer events.
    const lines = document.createElementNS(ns,'use');
    lines.setAttribute('href','#province-shapes');
    lines.setAttribute('stroke','#3d5357');
    lines.setAttribute('stroke-opacity','.61');
    lines.style.pointerEvents = 'none';
    map.scene.insertBefore(lines,map.labelLayer);

    let items = new Map();
    let byName = new Map();
    let initialized = null;
    let loading = false;

    function updateSearch() {
      search.placeholder = translate(loading ? 'Bölgeler yükleniyor…' : 'İl veya eyalet ara');
      const selected = byName.get(search.value);
      const names = document.createDocumentFragment();
      const localized = new Map();
      for (const [index, item] of items) {
        const {feature, path} = item;
        let key = feature.name+' · '+feature.country;
        if (localized.has(key)) key += ' ('+(Number(index)+1)+')';
        localized.set(key,item);
        const option = document.createElement('option');
        option.value = key;
        names.append(option);
        path.setAttribute('aria-label',key);
        if (selected === item) search.value = key;
      }
      options.replaceChildren(names);
      byName = localized;
    }

    async function load() {
      let rows = window.ATLAS_PROVINCES;
      if (!rows) {
        rows = await readProvinceResponse(await fetch('provinces.json'));
      }
      if (!Array.isArray(rows) || !rows.length || rows.length > MAX_UNITS) invalidProvinces();
      const budget = { encoded: 0, points: 0 };
      const nextItems = new Map();
      const shapes = document.createDocumentFragment();
      rows.forEach((row,index) => {
        if (!Array.isArray(row) || (row.length !== 4 && row.length !== 5)) invalidProvinces();
        const [name,iso,country,ring,englishName = name] = row;
        if ([name, iso, country, englishName].some(value => typeof value !== 'string' || value.length > 180)) invalidProvinces();
        const path = document.createElementNS(ns,'path');
        path.setAttribute('d',pathFor(ring, budget));
        path.setAttribute('stroke-width','.55');
        path.setAttribute('vector-effect','non-scaling-stroke');
        path.dataset.province = String(index);
        const feature = {
          id:'province-'+index, kind:'province',
          get name() { return english() ? englishName : name; },
          get country() { return /^[A-Z]{2}$/.test(iso) ? countryNames[english() ? 'en' : 'tr'].of(iso) : country; },
          get label() { return this.country+' · '+translate('Günümüzün birinci düzey idarî bölümü'); }
        };
        nextItems.set(String(index),{feature,path});
        shapes.append(path);
      });
      layer.append(shapes);
      items = nextItems;
      updateSearch();
    }
    const setVisible = enabled => {
      layer.style.display = lines.style.display = enabled ? '' : 'none';
      searchBox.hidden = !enabled;
      if (!enabled) search.value = '';
    };
    setVisible(false);
    document.addEventListener('atlas-language-change',updateSearch);
    toggle.addEventListener('change',async () => {
      map.select(null);
      setVisible(toggle.checked);
      if (!toggle.checked) return;
      search.disabled = true;
      loading = true;
      search.placeholder = translate('Bölgeler yükleniyor…');
      try {
        initialized ??= load();
        await initialized;
        search.disabled = false;
        document.getElementById('province-error').hidden = true;
      } catch {
        initialized = null;
        toggle.checked = false;
        setVisible(false);
        document.getElementById('province-error').hidden = false;
      } finally {
        loading = false;
        search.placeholder = translate('İl veya eyalet ara');
      }
    });
    function featureAt(target) { return items.get(target?.dataset?.province)?.feature; }
    layer.addEventListener('pointerover',e => {
      const feature = featureAt(e.target);
      if (feature && e.pointerType === 'mouse' && !e.buttons) map.callbacks.onHover(feature,e);
    });
    layer.addEventListener('pointerout',e => {
      if (e.pointerType === 'mouse') map.callbacks.onHover(null,e);
    });
    layer.addEventListener('click',e => {
      const feature = featureAt(e.target);
      if (feature) map.callbacks.onSelect(feature,{x:e.clientX,y:e.clientY,target:e.target});
    });
    search.addEventListener('change',() => {
      const result = byName.get(search.value);
      if (!result) return;
      document.getElementById('map-tools').open = false;
      const box = result.path.getBBox();
      map.scale = Math.max(2,Math.min(12,800/Math.max(box.width,1),400/Math.max(box.height,1)));
      map.x = 600-(box.x+box.width/2)*map.scale;
      map.y = 320-(box.y+box.height/2)*map.scale;
      map.view = 'custom';
      map.updateTransform();
      map.callbacks.onSelect(result.feature,{target:result.path});
    });
  };
})();
