(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const WIDTH = 1200;
  const HEIGHT = 640;
  const VIEWS = {
    world: [0, 0, 1],
    americas: [-78, 8, 2.0],
    europe: [17, 50, 4.8],
    africa: [18, 3, 3.0],
    asia: [102, 33, 2.35],
    oceania: [142, -20, 2.9]
  };
  const make = (tag, attrs = {}) => {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    return element;
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const translate = value => window.atlasT?.(value) ?? value;

  function project(lon, lat) {
    const lambda = lon * Math.PI / 180;
    const phi = lat * Math.PI / 180;
    const theta = Math.asin(Math.sqrt(3) / 2 * Math.sin(phi));
    const t2 = theta * theta;
    const t6 = t2 * t2 * t2;
    const x = 2 * Math.sqrt(3) * lambda * Math.cos(theta)
      / (3 * (1.340264 - 0.243957 * t2 + t6 * (0.006123 + 0.017204 * t2)));
    const y = theta * (1.340264 - 0.081319 * t2 + t6 * (0.000893 + 0.003796 * t2));
    return [600 + x * 198.5, 340 - y * 198.5];
  }

  function pathFor(ring, close = true) {
    const coordinates = ring.map(([lon, lat]) => project(lon, lat).map(n => n.toFixed(1)).join(','));
    return 'M' + coordinates.join('L') + (close ? 'Z' : '');
  }

  function readGeography(packed) {
    const empty = { countries: [], land: '' };
    if (!packed) return empty;
    try {
      return decodeGeography(packed);
    } catch {
      return empty;
    }
  }

  function decodeGeography(packed) {
    const invalid = () => { throw new Error('Invalid map geography'); };
    const { arcs: encoded, units, arcCount } = packed;
    if (typeof encoded !== 'string' || encoded.length > 1_250_000 ||
        !Number.isInteger(units) || units < 1 || units > 100 ||
        !Number.isInteger(arcCount) || arcCount < 1 || arcCount > 18_000 ||
        !Array.isArray(packed.countries) || packed.countries.length > 350) invalid();

    const bytes = atob(encoded);
    let offset = 0;
    function readVarUint() {
      let value = 0;
      for (let shift = 0; shift < 28 && offset < bytes.length; shift += 7) {
        const byte = bytes.charCodeAt(offset++);
        value += (byte & 127) * 2 ** shift;
        if (byte < 128) return value;
      }
      return invalid();
    }
    function readSigned() {
      const value = readVarUint();
      return (value >>> 1) ^ -(value & 1);
    }

    if (arcCount > Math.floor(bytes.length / 3)) invalid();
    let points = 0;
    const arcs = Array.from({ length: arcCount }, () => {
      const length = readVarUint();
      points += length;
      if (length < 1 || length > 36_000 || points > 400_000 ||
          length > Math.floor((bytes.length - offset) / 2)) invalid();

      let x = 0;
      let y = 0;
      const coordinates = Array.from({ length }, () => {
        x += readSigned();
        y += readSigned();
        if (x < -units || x > (WIDTH + 1) * units || y < -units || y > (HEIGHT + 1) * units) invalid();
        return (x / units) + ',' + (y / units);
      });
      return { length, forward: coordinates.join(' '), reverse: coordinates.reverse().join(' ') };
    });
    if (offset !== bytes.length) invalid();

    let references = 0;
    let expandedPoints = 0;
    function polygons(rings) {
      if (!Array.isArray(rings) || rings.length > 15_000) invalid();
      return rings.map(ring => {
        if (!Array.isArray(ring) || !ring.length || ring.length > 8_000) invalid();
        return 'M' + ring.map(index => {
          if (!Number.isInteger(index) || index < -arcs.length || index >= arcs.length) invalid();
          const arc = arcs[index >= 0 ? index : -index - 1];
          references++;
          expandedPoints += arc.length;
          if (references > 28_000 || expandedPoints > 450_000) invalid();
          return index >= 0 ? arc.forward : arc.reverse;
        }).join(' ') + 'Z';
      }).join('');
    }

    const countries = packed.countries.map(row => {
      if (!Array.isArray(row) || row.length !== 2 ||
          (row[0] !== null && (typeof row[0] !== 'string' || row[0].length > 180))) invalid();
      return { name: row[0], d: polygons(row[1]) };
    });
    return { countries, land: polygons(packed.land) };
  }

  const labels = [
    ['KUZEY AMERİKA', -111, 52], ['GÜNEY AMERİKA', -62, -20],
    ['AVRUPA', 15, 49], ['AFRİKA', 18, 14], ['ASYA', 89, 53],
    ['OKYANUSYA', 137, -25], ['PASİFİK OKYANUSU', -137, -4],
    ['ATLANTİK OKYANUSU', -34, 9], ['HİNT OKYANUSU', 80, -25]
  ];

  class ColonialMap {
    constructor(svg, callbacks = {}) {
      this.svg = svg;
      this.callbacks = callbacks;
      this.data = window.ATLAS_DATA ?? { powers: [], regions: [] };
      this.year = this.data.startYear ?? 1402;
      this.powers = new Map(this.data.powers.map(power => [power.id, power]));
      this.filter = new Set(this.powers.keys());
      this.scale = 1;
      this.x = 0;
      this.y = 0;
      this.view = 'world';
      this.active = new Map();
      this.selected = null;
      this.borders = false;
      this.showSubregions = true;
      this.subregions = (window.ATLAS_SUBREGIONS ?? []).map(region => ({
        ...region, kind: 'subregion', d: region.rings.map(ring => pathFor(ring)).join('')
      }));
      this.historicalFootprints = (window.ATLAS_FOOTPRINTS ?? []).map(footprint => ({
        ...footprint, d: footprint.rings.map(ring => pathFor(ring)).join('')
      }));
      this.build(readGeography(window.ATLAS_GEOGRAPHY));
      this.bind();
      this.render();
      document.addEventListener('atlas-language-change', () => this.updateLanguage());
    }

    build({ countries, land }) {
      const clipId = 'colonial-map-land-' + (this.svg.id || 'world');
      this.svg.setAttribute('viewBox', '0 0 1200 640');
      this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      this.svg.style.touchAction = 'none';
      this.svg.style.cursor = 'grab';
      const defs = make('defs');
      const clip = make('clipPath', { id: clipId });
      clip.append(make('path', { d: land, 'clip-rule': 'evenodd' }));
      defs.append(clip);
      this.landClip = land ? 'url(#' + clipId + ')' : 'none';
      this.scene = make('g');
      const grid = make('g', { fill: 'none', stroke: '#7196a4', 'stroke-opacity': '.25', 'stroke-width': '.45' });
      for (let lon = -180; lon <= 180; lon += 30) {
        const line = Array.from({ length: 36 }, (_, i) => [lon, -85 + i * 5]);
        grid.append(make('path', { d: pathFor(line, false) }));
      }
      for (let lat = -60; lat <= 60; lat += 15) {
        const line = Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]);
        grid.append(make('path', { d: pathFor(line, false) }));
      }
      this.scene.append(make('image', {
        href: window.ATLAS_TERRAIN['world'], x: 0, y: 0, width: WIDTH, height: HEIGHT,
        'pointer-events': 'none', 'aria-hidden': 'true'
      }));
      this.detailLayer = make('g', {'pointer-events':'none', 'aria-hidden':'true'});
      this.detailTiles = new Set();
      this.scene.append(this.detailLayer, grid);
      this.scene.append(make('path', {
        d: land, fill: 'none', stroke: '#567d80', 'stroke-opacity': '.65', 'vector-effect': 'non-scaling-stroke',
        'stroke-width': '.55', 'stroke-linejoin': 'round', 'fill-rule': 'evenodd'
      }));
      this.territories = make('g');
      this.subregionLayer = make('g', {
        'aria-label': translate('Tarihsel alt bölgeler'),
        'clip-path': this.landClip
      });
      this.scene.append(this.territories, this.subregionLayer);
      this.borderLayer = make('g', {
        fill: 'none', stroke: 'var(--map-border, #678293)', 'stroke-opacity': '.65', 'stroke-width': '.46',
        'pointer-events': 'none', display: 'none'
      });
      for (const country of countries) this.borderLayer.append(make('path', { d: country.d }));
      this.scene.append(this.borderLayer);
      this.labelLayer = make('g', { 'pointer-events': 'none' });
      for (const [name, lon, lat] of labels) {
        const [x, y] = project(lon, lat);
        const label = make('text', {
          x, y, 'text-anchor': 'middle', fill: '#244d5c', opacity: '.82', stroke: '#f8f7e9', 'stroke-width': '1.8', 'stroke-opacity': '.8', 'paint-order': 'stroke',
          'font-size': '9.5', 'font-weight': '600', 'font-family': 'inherit', 'letter-spacing': '2'
        });
        label.textContent = translate(name);
        this.labelLayer.append(label);
      }
      this.scene.append(this.labelLayer);
      this.markers = make('g');
      this.scene.append(this.markers);
      this.svg.replaceChildren(defs, this.scene);
    }

    updateLanguage() {
      this.subregionLayer.setAttribute('aria-label', translate('Tarihsel alt bölgeler'));
      labels.forEach(([name], index) => {
        this.labelLayer.children[index].textContent = translate(name);
      });
      const layers = [this.territories, this.subregionLayer, this.markers];
      for (const layer of layers) {
        for (const node of layer.children) {
          const feature = this.active.get(node.dataset.region);
          this.labelFeature(node, feature);
          const markerLabel = node.querySelector('text');
          if (markerLabel) markerLabel.textContent = translate(feature.name);
        }
      }
    }

    bind() {
      let drag = null;
      let suppressClick = false;
      this.svg.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        drag = { x: event.clientX, y: event.clientY, mapX: this.x, mapY: this.y, pointer: event.pointerId };
      });
      this.svg.addEventListener('pointermove', event => {
        if (drag?.pointer !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!suppressClick && Math.hypot(dx, dy) <= 4) return;
        if (!suppressClick) this.svg.setPointerCapture(event.pointerId);
        suppressClick = true;
        this.svg.style.cursor = 'grabbing';
        const { a } = this.svg.getScreenCTM();
        this.x = drag.mapX + dx / a;
        this.y = drag.mapY + dy / a;
        this.view = 'custom';
        this.updateTransform();
      });
      const finish = () => {
        drag = null;
        this.svg.style.cursor = 'grab';
        if (suppressClick) setTimeout(() => { suppressClick = false; }, 0);
      };
      this.svg.addEventListener('pointerup', finish);
      this.svg.addEventListener('pointercancel', finish);
      this.svg.addEventListener('click', event => {
        if (suppressClick) {
          event.stopImmediatePropagation();
          return;
        }
        const item = event.target.closest('[data-region]');
        const origin = event.detail === 0
          ? { target: item, keyboard: true }
          : { target: item, x: event.clientX, y: event.clientY };
        this.select(item?.dataset.region ?? null, true, origin);
      }, true);
      this.svg.addEventListener('wheel', event => {
        event.preventDefault();
        const point = this.svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const projected = point.matrixTransform(this.svg.getScreenCTM().inverse());
        this.zoomBy(Math.exp(-event.deltaY * .0016), projected.x, projected.y);
      }, { passive: false });
      this.svg.addEventListener('keydown', event => {
        const item = event.target.closest('[data-region]');
        if (item && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          this.select(item.dataset.region, true, { target: item, keyboard: true });
        }
      });
    }

    render() {
      this.active.clear();
      const shapes = [];
      const points = [];
      const unMode = this.unMode && this.year === this.data.endYear;
      const historical = unMode ? [] : this.historicalFootprints.filter(footprint =>
        this.year >= footprint.start && (footprint.end == null || this.year < footprint.end)
        && this.filter.has(footprint.power)
      );
      for (const region of (unMode ? this.data.unTerritories : this.data.regions)) {
        const period = region.periods.find(p => this.year >= p.start && (p.end == null || this.year < p.end));
        if (!period || (!unMode && !this.filter.has(period.power))) continue;
        const hasHistorical = historical.some(item => item.power === period.power && item.regionIds?.includes(region.id));
        const feature = { ...region, ...period, from: period.start, to: period.end, kind: hasHistorical ? 'territory' : 'point' };
        this.active.set(region.id, feature);
        const color = this.powers.get(period.power)?.color ?? '#cab881';
        const [x, y] = project(region.lon, region.lat);
        const point = make('g', { 'data-x': x, 'data-y': y });
        point.append(
          make('circle', { r: '13', fill: 'transparent' }),
          make('circle', { r: '7', fill: color, 'fill-opacity': '.17', class: 'atlas-point-halo' }),
          make('circle', { r: feature.kind === 'point' ? '3.2' : '2.5', fill: color, stroke: '#eaf0ef',
            'stroke-opacity': '.75', 'stroke-width': '.65' })
        );
        this.decorate(point, feature, true);
        points.push(point);
      }
      historical.forEach((item, index) => {
        const linked = (item.regionIds ?? []).map(id => this.active.get(id)).find(feature => feature?.power === item.power);
        const feature = linked ?? {
          id: 'historical-' + item.power + '-' + index,
          name: item.name,
          power: item.power,
          start: item.start,
          end: item.end,
          from: item.start,
          to: item.end,
          label: 'Referans haritadaki yaklaşık hâkimiyet alanı',
          kind: 'territory'
        };
        feature.boundarySource = item.source || 'historical-basemaps';
        this.active.set(feature.id, feature);
        const color = this.powers.get(item.power)?.color ?? '#cab881';
        const path = make('path', {
          d: item.d, fill: color, 'fill-opacity': '.74', stroke: color,
          'stroke-width': '.35', 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round',
          'fill-rule': 'evenodd', 'clip-path': this.landClip
        });
        this.decorate(path, feature, !linked);
        shapes.push(path);
      });
      if (points.length === 1 && !shapes.length) {
        const marker = points[0];
        const name = make('text', {x: 12, y: 4, fill: '#263d45', stroke: '#fffaf0', 'stroke-width': 3,
          'paint-order': 'stroke', 'font-size': 12, 'font-weight': 600});
        name.textContent = translate(this.active.get(marker.dataset.region).name);
        marker.append(name);
      }
      this.territories.replaceChildren(...shapes);
      this.renderSubregions(unMode);
      this.markers.replaceChildren(...points);
      this.renderSelection();
      this.updateTransform(false);
    }

    renderSubregions(unMode) {
      const areas = [];
      if (this.showSubregions && !unMode) {
        for (const region of this.subregions) {
          if (this.year < region.start || (region.end != null && this.year >= region.end)
              || !this.filter.has(region.power)) continue;
          this.active.set(region.id, region);
          const path = make('path', {
            d: region.d, fill: this.powers.get(region.power).color,
            stroke: '#374a50', 'stroke-opacity': '.86', 'stroke-dasharray': '3 2',
            'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke', 'fill-rule': 'evenodd',
            'data-subregion': ''
          });
          this.decorate(path, region, true);
          areas.push(path);
        }
      }
      this.subregionLayer.replaceChildren(...areas);
    }

    labelFeature(element, feature) {
      const label = [feature.name, feature.parentName].filter(Boolean).map(translate).join(', ');
      element.setAttribute('aria-label', label);
    }

    decorate(element, feature, keyboard) {
      element.dataset.region = feature.id;
      element.style.cursor = 'pointer';
      this.labelFeature(element, feature);
      if (keyboard) {
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-controls', 'map-popup');
      }
      element.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse' && !event.buttons) this.callbacks.onHover?.(feature, event);
      });
      element.addEventListener('pointerleave', event => {
        if (event.pointerType === 'mouse') this.callbacks.onHover?.(null, event);
      });
    }

    renderSelection() {
      const paths = [...this.territories.children, ...this.subregionLayer.children];
      for (const item of [...paths, ...this.markers.children]) {
        const selected = this.selected === item.dataset.region;
        if (item.getAttribute('role') === 'button') item.setAttribute('aria-pressed', String(selected));
        if (item.tagName === 'path') {
          if (item.hasAttribute('data-subregion')) {
            item.setAttribute('fill-opacity', selected ? '.53' : '.27');
            item.setAttribute('stroke-width', selected ? '1.55' : '.82');
          } else {
            item.setAttribute('fill-opacity', selected ? '.94' : '.74');
            item.setAttribute('stroke-width', selected ? '1.05' : '.35');
          }
        } else {
          const halo = item.querySelector('.atlas-point-halo');
          halo.setAttribute('stroke', selected ? '#edf4ef' : 'none');
          halo.setAttribute('r', selected ? '9' : '7');
        }
      }
    }

    updateTransform(emit = true) {
      this.x = clamp(this.x, -WIDTH * this.scale + WIDTH * .35, WIDTH * .65);
      this.y = clamp(this.y, -HEIGHT * this.scale + HEIGHT * .35, HEIGHT * .65);
      this.scene.setAttribute('transform', 'translate(' + this.x + ' ' + this.y + ') scale(' + this.scale + ')');
      const fit = this.svg.getScreenCTM?.()?.a || 1;
      for (const marker of this.markers.children) {
        marker.setAttribute('transform', 'translate(' + marker.dataset.x + ' ' + marker.dataset.y + ') scale(' + 1 / (fit * this.scale) + ')');
      }
      this.labelLayer.setAttribute('opacity', this.scale > 2.7 ? '.55' : '1');
      this.updateTerrain(fit);
      if (emit) this.callbacks.onViewChange?.({ scale: this.scale, view: this.view, x: this.x, y: this.y });
    }

    updateTerrain(fit) {
      if (this.scale * fit * (window.devicePixelRatio || 1) <= 2.5) return;
      const matrix = this.scene.getScreenCTM?.();
      if (!matrix) return;
      const frame = this.svg.getBoundingClientRect();
      for (let col = 0; col < 6; col++) {
        for (let row = 0; row < 4; row++) {
          const tile = col + '-' + row;
          if (this.detailTiles.has(tile)) continue;
          const x = col * 200, y = row * 160;
          const left = x * matrix.a + matrix.e, top = y * matrix.d + matrix.f;
          if (left > frame.right || top > frame.bottom ||
              left + 200 * matrix.a < frame.left || top + 160 * matrix.d < frame.top) continue;
          this.detailTiles.add(tile);
          this.detailLayer.append(make('image', {
            href: window.ATLAS_TERRAIN[tile], x, y, width: 200, height: 160
          }));
        }
      }
    }

    setYear(year) {
      this.year = Number(year);
      this.render();
    }

    setPowers(powers) {
      this.filter = new Set(powers ?? this.powers.keys());
      this.render();
    }

    setSubregions(visible) {
      this.showSubregions = Boolean(visible);
      this.render();
    }

    setBorders(visible) {
      this.borders = Boolean(visible);
      this.borderLayer.setAttribute('display', visible ? 'inline' : 'none');
    }

    setView(view) {
      if (!(view in VIEWS)) return;
      this.view = view;
      const [lon, lat, scale] = VIEWS[view];
      const [x, y] = project(lon, lat);
      this.scale = scale;
      this.x = view === 'world' ? 0 : WIDTH / 2 - x * scale;
      this.y = view === 'world' ? 0 : HEIGHT / 2 - y * scale;
      this.updateTransform();
    }

    zoomBy(factor, x = WIDTH / 2, y = HEIGHT / 2) {
      const next = clamp(this.scale * factor, 1, 12);
      const ratio = next / this.scale;
      this.x = x - (x - this.x) * ratio;
      this.y = y - (y - this.y) * ratio;
      this.scale = next;
      this.view = 'custom';
      this.updateTransform();
    }

    focusAt(lon,lat) {
      const [x,y] = project(lon,lat);
      this.scale = 4;
      this.x = WIDTH / 2 - x * this.scale;
      this.y = HEIGHT / 2 - y * this.scale;
      this.view = 'custom';
      this.updateTransform();
    }

    focusSubregion(id) {
      const region = this.active.get(id);
      if (region?.kind !== 'subregion') return;
      let focus = null;
      let greatestArea = 0;
      for (const ring of region.rings) {
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
        for (const [lon, lat] of ring) {
          const [x, y] = project(lon, lat);
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
        const width = right - left;
        const height = bottom - top;
        const area = width * height;
        if (area > greatestArea) {
          greatestArea = area;
          focus = { x: (left + right) / 2, y: (top + bottom) / 2, width, height };
        }
      }
      if (!focus) return;
      this.scale = clamp(.62 * Math.min(WIDTH / focus.width, HEIGHT / focus.height), 2, 12);
      this.x = WIDTH / 2 - focus.x * this.scale;
      this.y = HEIGHT / 2 - focus.y * this.scale;
      this.view = 'custom';
      this.updateTransform();
    }

    reset() {
      this.setView('world');
    }

    featureTarget(id) {
      const nodes = [...this.markers.children, ...this.subregionLayer.children, ...this.territories.children];
      return nodes.find(node => node.dataset.region === id) ?? null;
    }

    select(id, emit = true, origin = null) {
      const feature = this.active.get(id) ?? null;
      this.selected = feature?.id ?? null;
      this.renderSelection();
      if (emit) this.callbacks.onSelect?.(feature, origin);
      return feature;
    }
  }

  window.ColonialMap = ColonialMap;
})();
