(() => {
  const data = JSON.parse(document.getElementById('atlas-payload').textContent);
  window.ATLAS_TERRAIN = data.terrain;
  window.ATLAS_GEOGRAPHY = data.geography;
  window.ATLAS_FOOTPRINTS = data.footprints;
  window.ATLAS_SUBREGIONS = data.subregions;
  if (data.provinces) window.ATLAS_PROVINCES = data.provinces;
})();
