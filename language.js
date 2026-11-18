(() => {
  const english = {
    'Yeryüzü Atlası — Sömürgecilik Çağı': 'World Atlas — The Colonial Era',
    'Sömürgecilik Çağı': 'The Colonial Era',
    'Arayüz dili': 'Interface language',
    'Harita': 'Map',
    'Bugünkü sınırlar': 'Present-day borders',
    'Harita bölgesi': 'Map region',
    'Tüm dünya': 'Whole world',
    'Amerikalar': 'Americas', 'Avrupa': 'Europe', 'Afrika': 'Africa', 'Asya': 'Asia', 'Okyanusya': 'Oceania',
    'Tarihsel alt bölgeler': 'Historical subregions',
    'Tarihsel alt bölgeye git': 'Go to a historical subregion',
    'Alt bölgeleri keşfet…': 'Explore subregions…',
    'Bugünkü il ve eyaletler': 'Present-day provinces and states',
    'Günümüz idarî bölgelerinde ara': 'Search present-day administrative divisions',
    'İl veya eyalet ara': 'Find a province or state',
    'Bölgeler yüklenemedi. Katmanı açarak yeniden deneyebilirsin.': 'Regions could not be loaded. Switch the layer on to try again.',
    'BM listesindeki 17 toprağı göster': 'Show the 17 UN-listed territories',
    'Sömürgeci güçler': 'Colonial powers', 'Tümünü gizle': 'Hide all',
    'Yöntem ve kaynaklar': 'Method and sources', 'Kaynaklar': 'Sources',
    'Zaman çizelgesi': 'Timeline', 'Oynat': 'Play', 'Önceki yıl': 'Previous year',
    'Sonraki yıl': 'Next year', 'Yıl': 'Year', 'Oynatma hızı': 'Playback speed',
    'Gösterilen yıl': 'Displayed year', 'Önemli yıllara git': 'Go to a milestone year',
    'Tarihsel olaylar': 'Historical events', 'Önceki olay': 'Previous event',
    'Olayın ayrıntılarını göster': 'Show event details', 'Olaylar': 'Events', 'Sonraki olay': 'Next event',
    'Sol yıl': 'Left year', 'Sağ yıl': 'Right year', 'Karşılaştır': 'Compare',
    'Etkileşimli dünya haritası': 'Interactive world map',
    'Seçilen yıldaki sömürge yönetimlerini gösteren dünya haritası': 'World map of colonial rule in the selected year',
    'Karşılaştırılan yılın dünya haritası': 'World map for the comparison year',
    'Haritaların ayırıcısı': 'Map comparison divider',
    'Harita ayrıntıları': 'Map details', 'Ayrıntıları kapat': 'Close details',
    'Harita yakınlaştırma': 'Map zoom controls', 'Yakınlaştır': 'Zoom in', 'Uzaklaştır': 'Zoom out',
    'Haritayı sıfırla': 'Reset map', 'Yaklaşık sınırlar': 'Approximate boundaries',
    'Kapat': 'Close',
    'Atlas, 1402–2026 arasındaki seçilmiş sömürge yönetimlerini ve tarihsel dönüm noktalarını gösterir. Bir yönetim, başlangıç yılı dâhil ve bitiş yılı hariç olmak üzere etkin görünür. 1402, Kastilya destekli Lanzarote fethinin başlangıcıdır. 2026 son gözlem yılıdır.': 'The atlas follows selected colonial administrations and historical turning points from 1402 to 2026. Each administration is shown from its first year up to, but excluding, its end year. The Castilian-backed conquest of Lanzarote began in 1402. The final observation year is 2026.',
    'İşaretler liman, yerleşim, ada ya da daha geniş bir bölgeyi temsil edebilir. Bazı başlangıç yılları ilk yerleşimi ya da kıyıda kurulan ilk yönetimi tarihler. Sınırı belgelenen yerler alanla, yalnızca konumu bilinen yönetimler noktayla gösterilir. Renkli alanlar seçilmiş tarihsel haritalara dayanır ve referans yılları arasındaki hâkimiyet alanlarını yaklaşık olarak gösterir. Bugünkü ülke sınırları yön bulmak için açılabilir. Yerli toplumlar, sömürgeleştirilmemiş devletler ve aynı anda var olan farklı yönetim biçimleri haritada eksik kalabilir.': 'Markers can represent a port, settlement, island or wider region. Some start dates mark the first settlement or coastal administration. Areas show documented boundaries. Points mark administrations for which only the location is known. Shaded areas use selected historical maps to approximate territorial control between reference years. You can turn on present-day borders for orientation. The map may leave out Indigenous societies, states that remained independent and forms of government that coexisted.',
    'Schvitz, Rüegger, Girardin, Cederman, Weidmann ve Gleditsch (2022) · CShapes 2.0': 'Schvitz, Rüegger, Girardin, Cederman, Weidmann and Gleditsch (2022) · CShapes 2.0',
    '. Seçili dönem sınırları yıllık gösterime uyarlanmıştır.': '. Selected period boundaries have been adapted for display by year.',
    'Natural Earth II · gölgeli yeryüzü ve deniz tabanı': 'Natural Earth II · shaded terrain and seafloor',
    'Natural Earth · kıyılar, ülkeler ve birinci düzey idarî bölümler (1:10 milyon)': 'Natural Earth · coastlines, countries and first-level administrative divisions (1:10 million)',
    'André Ourednik ve katkıcılar · Historical Basemaps (GPL-3.0)': 'André Ourednik and contributors · Historical Basemaps (GPL-3.0)',
    'Tarihsel harita verisinin lisansı': 'Historical map data license',
    'World Atlas · ISC lisansı': 'World Atlas · ISC license'
  };
  window.atlasT = text => {
    if (document.documentElement.lang !== 'en' || typeof text !== 'string') return text;
    return english[text] ?? window.ATLAS_EN?.[text] ?? window.ATLAS_MAP_EN?.[text] ?? text;
  };

  // Bind only the original static labels. The map and timeline own their dynamic labels.
  const bindings = [];
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest('script, style, pre')) continue;
    const original = node.data;
    const key = original.trim();
    if (Object.hasOwn(english, key)) {
      bindings.push(() => { node.data = original.replace(key, () => window.atlasT(key)); });
    }
  }
  for (const el of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
    for (const attr of ['aria-label', 'title', 'placeholder']) {
      const value = el.getAttribute(attr);
      if (Object.hasOwn(english, value)) bindings.push(() => el.setAttribute(attr, window.atlasT(value)));
    }
  }

  const control = document.getElementById('language-switch');
  const storageKey = 'atlas.language';
  function apply(lang) {
    document.documentElement.lang = lang;
    control.querySelector('input[value="' + lang + '"]').checked = true;
    for (const render of bindings) render();
  }
  function select(lang) {
    if (lang === document.documentElement.lang) return;
    apply(lang);
    try { localStorage.setItem(storageKey, lang); } catch { /* Storage may be disabled offline. */ }
    document.dispatchEvent(new Event('atlas-language-change'));
  }
  let initial = 'tr';
  try { if (localStorage.getItem(storageKey) === 'en') initial = 'en'; } catch { /* Use the default. */ }
  apply(initial);
  control.addEventListener('change', event => select(event.target.value));

  let startX = null;
  control.addEventListener('pointerdown', event => { if (event.isPrimary) startX = event.clientX; });
  control.addEventListener('pointercancel', () => { startX = null; });
  control.addEventListener('pointerup', event => {
    if (startX !== null && Math.abs(event.clientX - startX) > 8) {
      const bounds = control.getBoundingClientRect();
      select(event.clientX >= bounds.left + bounds.width / 2 ? 'en' : 'tr');
      // Touch can dispatch a click on the radio where the swipe began.
      const cancelClick = e => e.preventDefault();
      control.addEventListener('click', cancelClick, {once:true, capture:true});
      setTimeout(() => control.removeEventListener('click', cancelClick, true), 0);
    }
    startX = null;
  });
})();
