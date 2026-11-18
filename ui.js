(() => {
  'use strict';

  const { powers, events, sources } = ATLAS_DATA;
  const orderedEvents = [...events].sort((a, b) => a.year - b.year);
  const powerById = new Map(powers.map(power => [power.id, power]));
  const sourceById = new Map(sources.map(source => [source.id, source]));
  const get = id => document.getElementById(id);
  const english = () => document.documentElement.lang.startsWith('en');
  const copy = (turkish, translation) => english() ? translation : turkish;
  const translate = value => value && (window.atlasT?.(value) ?? value);
  const translatedNames = values => values.filter(Boolean).map(translate).join(' · ');
  const slider = get('time-track');
  const compareToggle = get('compare-toggle');
  const compareLeftYear = get('compare-left-year');
  const compareRightYear = get('compare-right-year');
  const divider = get('compare-divider');
  const provinceToggle = get('modern-provinces');
  const unToggle = get('un-layer');
  const yearInput = get('year');
  const startYear = Number(slider.min);
  const endYear = Number(slider.max);
  const speedInput = get('speed');
  const playButton = get('play');
  const legendToggle = get('legend-toggle');
  const eventBody = get('event-body');
  const popup = get('map-popup');
  const popupClose = get('popup-close');
  const mapFrame = get('map-frame');
  const showEvent = get('show-event');
  const showSubregions = get('show-subregions');
  const subregionJump = get('subregion-jump');
  const previousEvent = get('prev-event');
  const nextEvent = get('next-event');
  const sourcesDialog = get('sources');
  const enabledPowers = new Set(powers.map(power => power.id));
  const powerInputs = new Map();
  const localizedNodes = [];
  const milestones = [startYear, 1492, 1600, 1750, 1884, 1945, 1960, 2026];
  let year = startYear;
  let eventIndex = -1;
  let popupMode = null;
  let popupItem = null;
  let popupAnchor = null;
  let refreshPopup = null;
  let returnFocus = null;
  let timer = null;
  let lastTick = 0;
  let playProgress = 0;
  let comparison = null;
  let singleView = null;
  let comparisonYears = null;

  const map = new ColonialMap(get('map'), {
    onSelect(feature, origin) {
      if (!feature) {
        dismissPopup();
        return;
      }
      stopPlaying();
      comparison?.rightMap?.select(null, false);
      openFeature(feature, 'pinned', origin ?? { target: map.featureTarget(feature.id) });
    },
    onHover(feature, event) {
      if (popupMode && popupMode !== 'preview') return;
      if (feature) openFeature(feature, 'preview', { x: event.clientX, y: event.clientY });
      else dismissPopup();
    },
    onViewChange() {
      dismissPopup();
    }
  });

  function element(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function localize(node, content) {
    node.textContent = content();
    localizedNodes.push({ node, content });
    return node;
  }

  function sourceLink(source, title) {
    let url;
    try { url = new URL(source.url); } catch { return element('span', title); }
    if (url.protocol !== 'https:' || url.username || url.password) return element('span', title);
    const link = element('a', title);
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  function updateEventNavigation() {
    get('event-position').textContent = `${Math.max(0, eventIndex + 1)} / ${orderedEvents.length} ${copy('olay', 'events')}`;
    previousEvent.disabled = eventIndex < 0 || (eventIndex === 0 && orderedEvents[0].year === year);
    nextEvent.disabled = eventIndex >= orderedEvents.length - 1;
    showEvent.disabled = eventIndex < 0;
  }

  function dismissPopup(restoreFocus = false) {
    if (!popupMode) return;
    const target = returnFocus;
    popup.hidden = true;
    popupMode = null;
    popupItem = null;
    popupAnchor = null;
    refreshPopup = null;
    returnFocus = null;
    map.select(null, false);
    comparison?.rightMap?.select(null, false);
    if (restoreFocus && target?.isConnected) {
      (target.disabled ? showEvent : target).focus({ preventScroll: true });
    }
  }

  function positionPopup() {
    const frame = mapFrame.getBoundingClientRect();
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    const gap = 10;
    const leftEdge = Math.max(gap, -frame.left + gap);
    const rightEdge = Math.min(frame.width, window.innerWidth - frame.left) - gap;
    const topEdge = Math.max(gap, -frame.top + gap);
    const bottomEdge = Math.min(frame.height, window.innerHeight - frame.top) - gap;
    const rect = popupAnchor?.target?.getBoundingClientRect();
    const x = popupAnchor?.x ?? (rect ? rect.left + rect.width / 2 : null);
    const y = popupAnchor?.y ?? (rect ? rect.top + rect.height / 2 : null);
    const localX = x == null ? leftEdge : x - frame.left;
    const localY = y == null ? topEdge : y - frame.top;
    const naturalX = x != null && localX + width + gap > rightEdge ? localX - width - gap : localX + gap;
    const naturalY = y != null && localY + height + gap > bottomEdge ? localY - height - gap : localY + gap;
    const left = Math.max(leftEdge, Math.min(rightEdge - width, naturalX));
    const top = Math.max(topEdge, Math.min(bottomEdge - height, naturalY));
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.right = 'auto';
    popup.style.bottom = 'auto';
  }

  function revealPopup(mode, item, anchor, kicker, date, title, paragraphs, source) {
    popupMode = mode;
    popupItem = item;
    popupAnchor = anchor;
    returnFocus = anchor?.returnTarget ?? anchor?.target ?? null;
    const preview = mode === 'preview';
    popup.classList.toggle('popup-preview', preview);
    popup.style.pointerEvents = preview ? 'none' : '';
    popupClose.hidden = preview;
    popup.setAttribute('role', preview ? 'tooltip' : 'region');
    popup.setAttribute('aria-labelledby', 'event-title');
    get('event-kicker').textContent = kicker;
    const heading = element('h2', title);
    heading.id = 'event-title';
    eventBody.replaceChildren(element('p', date, 'event-date'), heading);
    for (const paragraph of paragraphs.filter(Boolean)) eventBody.append(element('p', paragraph));
    if (source && !preview) eventBody.append(sourceLink(source, copy('Kaynağı aç ↗', 'Open source ↗')));
    popup.hidden = false;
    positionPopup();
    if (anchor?.keyboard && !preview) popupClose.focus({ preventScroll: true });
  }

  function openFeature(feature, mode, anchor, context = { side: 'left', year }, refreshing = false) {
    const { id, name, power, label, start, end } = feature;
    const popupKey = `${context.side}:${context.year}:${id}`;
    if (!refreshing && mode === 'preview' && popupMode === mode && popupItem === popupKey) return;
    refreshPopup = () => openFeature(feature, mode, { ...anchor, keyboard: false }, context, true);
    const side = context.side === 'left' ? copy('Sol harita', 'Left map') : copy('Sağ harita', 'Right map');
    const mapDate = date => singleView ? `${side} · ${context.year} · ${date}` : date;
    if (feature.kind === 'province') {
      revealPopup(mode, popupKey, anchor, copy('GÜNÜMÜZÜN İDARİ BÖLÜMLERİ', 'MODERN ADMINISTRATIVE DIVISIONS'),
        mapDate(copy('Güncel referans', 'Present-day reference')), name, [label],
        { url: 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/', title: 'Natural Earth' });
      return;
    }
    if (feature.kind === 'subregion') {
      const snapshot = feature.sourceYear;
      const source = sourceById.get(feature.source) ?? {
        url: snapshot
          ? `https://github.com/aourednik/historical-basemaps/blob/master/geojson/world_${snapshot}.geojson`
          : 'https://github.com/aourednik/historical-basemaps'
      };
      const lastYear = end == null ? copy('günümüz', 'present') : end - 1;
      const date = lastYear === start ? String(start) : `${start}–${lastYear}`;
      revealPopup(mode, popupKey, anchor, copy('TARİHSEL ALT BÖLGE', 'HISTORICAL SUBREGION'), mapDate(date), translate(name), [
        translatedNames([feature.parentName, powerById.get(power)?.name]),
        translate(label),
        snapshot ? copy(`Kaynak harita yılı ${snapshot}`, `Source map year ${snapshot}`) : null
      ], source);
      return;
    }
    const isUn = power === 'un';
    const event = isUn ? null : orderedEvents.findLast(candidate =>
      candidate.region === id && candidate.year <= context.year && candidate.power === power
    );
    const source = sourceById.get(isUn ? 'nsgt' : event?.source);
    const date = isUn ? `${context.year} · ${copy('BM LİSTESİ', 'UN LIST')}`
      : end == null ? `${start}–${copy('günümüz', 'present')}` : `${start}–${end}`;
    revealPopup(mode, popupKey, anchor, copy('SEÇİLİ YER', 'SELECTED PLACE'), mapDate(date), translate(name), [
      translatedNames([powerById.get(power)?.name, label]),
      translate(event?.description)
    ], source);
    if (feature.boundarySource && mode !== 'preview') {
      const url = feature.boundarySource === 'cshapes' ? 'https://icr.ethz.ch/data/cshapes/' : 'https://github.com/aourednik/historical-basemaps';
      eventBody.append(sourceLink({ url }, copy('Sınırın kaynağı ↗', 'Boundary source ↗')));
      positionPopup();
    }
  }

  function openEvent(returnTarget, keyboard = false) {
    const event = orderedEvents[eventIndex];
    if (!event) return;
    stopPlaying();
    map.select(null, false);
    function renderEvent(focusClose) {
      revealPopup('event', eventIndex, { returnTarget, keyboard: focusClose }, copy('ZAMAN ÇİZELGESİ', 'TIMELINE'),
        String(event.year), translate(event.title), [translate(event.description)], sourceById.get(event.source));
    }
    refreshPopup = () => renderEvent(false);
    renderEvent(keyboard);
  }

  popupClose.addEventListener('click', () => dismissPopup(true));
  showEvent.addEventListener('click', event => openEvent(showEvent, event.detail === 0));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && popupMode && !sourcesDialog.open) {
      event.preventDefault();
      dismissPopup(true);
    }
  });
  window.addEventListener('resize', () => { if (popupMode) positionPopup(); });
  window.addEventListener('scroll', () => { if (popupMode) positionPopup(); }, { passive: true });

  function clampYear(value) {
    return Math.max(startYear, Math.min(endYear, Math.round(value)));
  }

  function changeYear(nextYear, targetEventIndex) {
    dismissPopup();
    year = clampYear(nextYear);
    if (year !== endYear) unToggle.checked = false;
    map.unMode = !singleView && year === endYear && unToggle.checked;
    get('un-panel').hidden = Boolean(singleView) || year !== endYear;
    get('un-links').hidden = !map.unMode;
    get('power-panel').hidden = map.unMode;
    slider.value = year;
    yearInput.value = year;
    if (singleView) compareLeftYear.value = year;
    get('prev-year').disabled = year === startYear;
    get('next-year').disabled = year === endYear;
    map.setYear(year);
    eventIndex = targetEventIndex ?? orderedEvents.findLastIndex(event => event.year <= year);
    document.querySelectorAll('.milestones button').forEach(button => {
      button.classList.toggle('current', Number(button.dataset.year) === year);
    });
    updateEventNavigation();
  }

  function toggleComparison() {
    stopPlaying();
    dismissPopup();
    if (singleView) {
      comparisonYears = [year, Number(compareRightYear.value)];
      const saved = singleView;
      singleView = null;
      comparison.setEnabled(false);
      get('compare-overlay').hidden = true;
      get('compare-years').hidden = true;
      get('timeline').removeAttribute('data-comparing');
      compareToggle.setAttribute('aria-pressed', 'false');
      updateComparisonLabels();
      provinceToggle.disabled = false;
      unToggle.checked = saved.un;
      changeYear(saved.year, saved.eventIndex);
      if (saved.provinces) {
        provinceToggle.checked = true;
        provinceToggle.dispatchEvent(new Event('change'));
      }
      return;
    }

    singleView = { year, eventIndex, un: unToggle.checked, provinces: provinceToggle.checked };
    if (provinceToggle.checked) {
      provinceToggle.checked = false;
      provinceToggle.dispatchEvent(new Event('change'));
    }
    provinceToggle.disabled = true;
    unToggle.checked = false;
    comparison ??= new AtlasComparison(map, {
      rightSvg: get('map-right'),
      divider,
      onSelect(feature, origin, context) {
        if (!feature) {
          dismissPopup();
          return;
        }
        map.select(null, false);
        openFeature(feature, 'pinned', origin ?? { target: context.map.featureTarget(feature.id) }, context);
      },
      onHover(feature, event, context) {
        if (popupMode && popupMode !== 'preview') return;
        if (feature) openFeature(feature, 'preview', { x: event.clientX, y: event.clientY }, context);
        else dismissPopup();
      },
      onViewChange() {
        dismissPopup();
      }
    });
    const [left, right] = comparisonYears ?? (
      year === startYear ? [1878, 1914] : [year, year === endYear ? 1914 : Math.min(endYear, year + 36)]
    );
    get('compare-years').hidden = false;
    get('compare-overlay').hidden = false;
    get('timeline').setAttribute('data-comparing', '');
    compareToggle.setAttribute('aria-pressed', 'true');
    updateComparisonLabels();
    compareRightYear.value = right;
    changeYear(left);
    comparison.setYear(right);
    comparison.setEnabled(true);
  }

  compareToggle.addEventListener('click', toggleComparison);
  compareLeftYear.addEventListener('change', () => {
    const value = compareLeftYear.valueAsNumber;
    if (Number.isFinite(value)) changeYear(value);
    else compareLeftYear.value = year;
  });
  compareRightYear.addEventListener('change', () => {
    const value = compareRightYear.valueAsNumber;
    const rightYear = Number.isFinite(value) ? clampYear(value) : comparison.rightMap.year;
    dismissPopup();
    compareRightYear.value = rightYear;
    comparison.setYear(rightYear);
  });
  for (const compareYear of [compareLeftYear, compareRightYear]) {
    compareYear.addEventListener('keydown', event => {
      if (event.key === 'Enter') compareYear.blur();
    });
  }
  function updateComparisonLabels() {
    compareToggle.textContent = singleView
      ? copy('Karşılaştırmayı kapat', 'Close comparison')
      : copy('Karşılaştır', 'Compare');
    divider.setAttribute('aria-valuetext', copy(`Sol harita yüzde ${divider.value}`, `Left map ${divider.value}%`));
  }

  divider.addEventListener('input', () => {
    dismissPopup();
    updateComparisonLabels();
  });
  const compareHitZone = get('compare-hit-zone');
  function moveDivider(event) {
    const bounds = mapFrame.getBoundingClientRect();
    const percent = Math.round(100 * (event.clientX - bounds.left) / bounds.width);
    divider.value = Math.max(Number(divider.min), Math.min(Number(divider.max), percent));
    divider.dispatchEvent(new Event('input'));
  }
  compareHitZone.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    compareHitZone.setPointerCapture(event.pointerId);
    divider.focus({ preventScroll: true });
    moveDivider(event);
  });
  compareHitZone.addEventListener('pointermove', event => {
    if (compareHitZone.hasPointerCapture(event.pointerId)) moveDivider(event);
  });

  function stopPlaying() {
    if (timer == null) return;
    clearInterval(timer);
    timer = null;
    updatePlayButton();
  }

  function updatePlayButton() {
    const playing = timer != null;
    const label = playing ? copy('Duraklat', 'Pause') : copy('Oynat', 'Play');
    playButton.textContent = playing ? '❚❚' : '▶';
    playButton.title = label;
    playButton.setAttribute('aria-label', label);
    playButton.setAttribute('aria-pressed', String(playing));
  }

  function manualYear(newYear, targetEventIndex) {
    stopPlaying();
    changeYear(newYear, targetEventIndex);
  }

  function togglePlaying() {
    if (timer != null) {
      stopPlaying();
      return;
    }
    if (year === endYear) changeYear(startYear);
    lastTick = performance.now();
    playProgress = 0;
    timer = setInterval(() => {
      const now = performance.now();
      playProgress += Math.min(1, (now - lastTick) / 1000) * Number(speedInput.value);
      lastTick = now;
      const elapsedYears = Math.floor(playProgress);
      if (elapsedYears === 0) return;
      playProgress -= elapsedYears;
      changeYear(year + elapsedYears);
      if (year === endYear) stopPlaying();
    }, 40);
    updatePlayButton();
  }

  function updateFilters() {
    dismissPopup();
    map.setPowers([...enabledPowers]);
    updateLegendToggle();
  }

  function updateLegendToggle() {
    legendToggle.textContent = enabledPowers.size
      ? copy('Tümünü gizle', 'Hide all')
      : copy('Tümünü göster', 'Show all');
  }

  for (const power of powers) {
    const item = element('label', '', 'power');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) enabledPowers.add(power.id);
      else enabledPowers.delete(power.id);
      updateFilters();
    });
    const swatch = element('span', '', 'swatch');
    swatch.style.setProperty('--power-color', power.color);
    swatch.setAttribute('aria-hidden', 'true');
    item.append(checkbox, swatch, localize(element('span', ''), () => translate(power.name)));
    get('legend').append(item);
    powerInputs.set(power.id, checkbox);
  }

  legendToggle.addEventListener('click', () => {
    const showAll = enabledPowers.size === 0;
    enabledPowers.clear();
    for (const [id, input] of powerInputs) {
      input.checked = showAll;
      if (showAll) enabledPowers.add(id);
    }
    updateFilters();
  });

  for (const milestone of milestones) {
    const button = element('button', String(milestone));
    button.type = 'button';
    button.dataset.year = milestone;
    button.addEventListener('click', () => manualYear(milestone));
    document.querySelector('.milestones').append(button);
  }

  for (const source of sources) {
    const item = document.createElement('li');
    item.append(localize(sourceLink(source, ''), () => translate(source.title)));
    get('source-list').append(item);
  }

  const subregions = new Map(map.subregions.map(region => [region.id, region]));
  get('subregion-panel').hidden = subregions.size === 0;
  const groups = new Map();
  for (const region of [...subregions.values()].sort((a, b) =>
    (a.sourceYear ?? a.start) - (b.sourceYear ?? b.start)
      || a.name.localeCompare(b.name, 'tr')
  )) {
    const referenceYear = region.sourceYear ?? region.start;
    if (!groups.has(referenceYear)) {
      const group = document.createElement('optgroup');
      group.label = String(referenceYear);
      subregionJump.append(group);
      groups.set(referenceYear, group);
    }
    const option = localize(element('option', ''), () => translatedNames([region.name, region.parentName]));
    option.value = region.id;
    groups.get(referenceYear).append(option);
  }
  showSubregions.addEventListener('change', () => {
    dismissPopup();
    map.setSubregions(showSubregions.checked);
  });
  subregionJump.addEventListener('change', () => {
    const region = subregions.get(subregionJump.value);
    subregionJump.value = '';
    if (!region) return;
    const tools = get('map-tools');
    tools.open = false;
    get('un-layer').checked = false;
    get('map-view').value = 'world';
    if (!enabledPowers.has(region.power)) {
      enabledPowers.add(region.power);
      powerInputs.get(region.power).checked = true;
      updateFilters();
    }
    if (!showSubregions.checked) {
      showSubregions.checked = true;
      map.setSubregions(true);
    }
    const jumpYear = Math.max(region.start, Math.min(region.sourceYear ?? region.start, (region.end ?? endYear + 1) - 1));
    manualYear(jumpYear);
    map.focusSubregion(region.id);
    map.select(region.id, true, {
      target: map.featureTarget(region.id), returnTarget: tools.querySelector('summary'), keyboard: true
    });
  });

  for (const region of ATLAS_DATA.unTerritories) {
    const button = localize(element('button', ''), () => translate(region.name));
    button.type = 'button';
    button.addEventListener('click', event => {
      map.focusAt(region.lon, region.lat);
      map.select(region.id, true, {
        target: map.featureTarget(region.id), returnTarget: button, keyboard: event.detail === 0
      });
    });
    get('un-links').append(button);
  }
  get('un-layer').addEventListener('change', () => {
    get('map-view').value='world';
    map.reset();
    changeYear(year);
  });
  updatePlayButton();
  updateComparisonLabels();
  playButton.addEventListener('click', togglePlaying);
  slider.addEventListener('input', () => manualYear(Number(slider.value)));
  yearInput.addEventListener('change', () => {
    if (yearInput.value === '') yearInput.value = year;
    else manualYear(Number(yearInput.value));
  });
  yearInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') yearInput.blur();
  });
  get('prev-year').addEventListener('click', () => manualYear(year - 1));
  get('next-year').addEventListener('click', () => manualYear(year + 1));
  previousEvent.addEventListener('click', event => {
    const index = orderedEvents[eventIndex].year < year ? eventIndex : eventIndex - 1;
    manualYear(orderedEvents[index].year, index);
    openEvent(previousEvent, event.detail === 0);
  });
  nextEvent.addEventListener('click', event => {
    const index = eventIndex + 1;
    manualYear(orderedEvents[index].year, index);
    openEvent(nextEvent, event.detail === 0);
  });
  get('show-borders').addEventListener('change', event => map.setBorders(event.target.checked));
  get('map-view').addEventListener('change', event => map.setView(event.target.value));
  get('zoom-in').addEventListener('click', () => map.zoomBy(1.35));
  get('zoom-out').addEventListener('click', () => map.zoomBy(1 / 1.35));
  get('reset-map').addEventListener('click', () => {
    get('map-view').value = 'world';
    map.reset();
  });
  get('show-sources').addEventListener('click', () => {
    stopPlaying();
    sourcesDialog.showModal();
  });
  get('close-sources').addEventListener('click', () => sourcesDialog.close());
  sourcesDialog.addEventListener('click', event => {
    if (event.target === sourcesDialog) sourcesDialog.close();
  });

  document.addEventListener('pointerdown', event => {
    const tools = get('map-tools');
    if (tools.open && !tools.contains(event.target) && !event.target.closest('#language-switch')) tools.open = false;
  });
  get('un-links').addEventListener('click', () => { get('map-tools').open = false; });
  document.addEventListener('atlas-language-change', () => {
    for (const { node, content } of localizedNodes) node.textContent = content();
    updateEventNavigation();
    updateComparisonLabels();
    updatePlayButton();
    updateLegendToggle();
    refreshPopup?.();
  });
  if (window.innerWidth < 600) map.zoomBy(2, 560, 295);
  window.installProvinceLayer?.(map);
  changeYear(startYear, orderedEvents[0]?.year === startYear ? 0 : -1);
  updateFilters();
  map.setBorders(get('show-borders').checked);
})();
