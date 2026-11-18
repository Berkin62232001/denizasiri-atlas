(() => {
  'use strict';

  class AtlasComparison {
    constructor(leftMap, { rightSvg, divider, onSelect, onHover, onViewChange } = {}) {
      this.leftMap = leftMap;
      this.rightSvg = rightSvg;
      this.divider = divider;
      this.overlay = divider.closest('#compare-overlay') ?? divider.parentElement;
      this.callbacks = { onSelect, onHover, onViewChange };
      this.rightYear = leftMap.year;
      const initialSplit = Number(divider.value);
      this.split = Number.isFinite(initialSplit) ? initialSplit : 50;
      this.enabled = false;
      this.rightMap = null;
      this.frameRequest = null;

      // The ordinary map retains ownership of its view callback and data updates.
      const leftViewChanged = leftMap.callbacks.onViewChange;
      leftMap.callbacks.onViewChange = state => {
        this.syncFromLeft();
        leftViewChanged?.(state);
      };
      const render = leftMap.render.bind(leftMap);
      leftMap.render = () => {
        render();
        this.syncLayers();
        this.queueVisibility();
      };
      const setBorders = leftMap.setBorders.bind(leftMap);
      leftMap.setBorders = visible => {
        setBorders(visible);
        this.syncLayers();
      };

      divider.addEventListener('input', () => this.setSplit(divider.value));
      document.getElementById('modern-provinces')?.addEventListener('change', () => {
        queueMicrotask(() => this.syncLayers());
      });
      window.addEventListener('resize', () => {
        if (!this.enabled) return;
        this.leftMap.updateTransform(false);
        this.syncFromLeft();
      });
      rightSvg.style.display = 'none';
      rightSvg.setAttribute('aria-hidden', 'true');
    }

    context() {
      return { side: 'right', year: this.rightYear, map: this.rightMap };
    }

    createRightMap() {
      return new window.ColonialMap(this.rightSvg, {
        onSelect: (feature, origin) => {
          if (this.enabled) this.callbacks.onSelect?.(feature, origin, this.context());
        },
        onHover: (feature, event) => {
          if (this.enabled) this.callbacks.onHover?.(feature, event, this.context());
        },
        onViewChange: state => {
          if (!this.enabled) return;
          this.copyCamera(this.rightMap, this.leftMap);
          this.callbacks.onViewChange?.(state, this.context());
          this.queueVisibility();
        }
      });
    }

    setEnabled(enabled) {
      const next = Boolean(enabled);
      if (next === this.enabled) return;
      this.enabled = next;
      if (next) {
        this.previousLeftClip = this.leftMap.svg.style.clipPath;
        this.rightSvg.removeAttribute('hidden');
        this.rightSvg.removeAttribute('aria-hidden');
        this.rightSvg.style.display = '';
        this.rightMap ??= this.createRightMap();
        this.setSplit(this.split);
        this.syncLayers();
        this.syncFromLeft();
      } else {
        this.rightMap?.select(null, false);
        this.rightSvg.style.display = 'none';
        this.rightSvg.setAttribute('hidden', '');
        this.rightSvg.setAttribute('aria-hidden', 'true');
        this.leftMap.svg.style.clipPath = this.previousLeftClip;
        this.restoreLeftTargets();
      }
    }

    setYear(year) {
      const numericYear = Number(year);
      if (!Number.isFinite(numericYear)) return;
      const { startYear, endYear } = this.leftMap.data;
      this.rightYear = Math.max(startYear, Math.min(endYear, Math.round(numericYear)));
      this.syncLayers();
    }

    setSplit(percent) {
      const numeric = Number(percent);
      if (!Number.isFinite(numeric)) return;
      this.split = Math.max(Number(this.divider.min || 0), Math.min(Number(this.divider.max || 100), numeric));
      this.divider.value = String(this.split);
      this.overlay.style.setProperty('--compare-split', this.split + '%');
      if (!this.enabled) return;
      this.leftMap.svg.style.clipPath = 'inset(0 ' + (100 - this.split) + '% 0 0)';
      this.rightSvg.style.clipPath = 'inset(0 0 0 ' + this.split + '%)';
      this.queueVisibility();
    }

    copyCamera(from, to) {
      to.x = from.x;
      to.y = from.y;
      to.scale = from.scale;
      to.view = from.view;
      to.updateTransform(false);
    }

    syncFromLeft() {
      if (!this.enabled || !this.rightMap) return;
      this.copyCamera(this.leftMap, this.rightMap);
      this.queueVisibility();
    }

    syncLayers() {
      if (!this.enabled || !this.rightMap) return;
      const left = this.leftMap;
      const right = this.rightMap;
      const unMode = Boolean(left.unMode && this.rightYear === right.data.endYear);
      if (right.borders !== left.borders) right.setBorders(left.borders);
      if (right.year !== this.rightYear || right.filter !== left.filter ||
          right.showSubregions !== left.showSubregions || right.unMode !== unMode) {
        right.filter = left.filter;
        right.showSubregions = left.showSubregions;
        right.unMode = unMode;
        right.selected = null;
        right.setYear(this.rightYear);
        this.queueVisibility();
      }
      this.syncProvinceOutlines();
    }

    syncProvinceOutlines() {
      const source = this.leftMap.scene.querySelector('#province-shapes');
      if (!source) return;
      if (!this.provinceOutlines) {
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#province-shapes');
        use.setAttribute('stroke', '#3d5357');
        use.setAttribute('stroke-opacity', '.61');
        use.setAttribute('pointer-events', 'none');
        use.setAttribute('aria-hidden', 'true');
        this.rightMap.scene.insertBefore(use, this.rightMap.labelLayer);
        this.provinceOutlines = use;
      }
      this.provinceOutlines.style.display = source.style.display;
    }

    queueVisibility() {
      if (!this.enabled || this.frameRequest != null) return;
      this.frameRequest = window.requestAnimationFrame(() => {
        this.frameRequest = null;
        if (!this.enabled) return;
        this.updateTargetVisibility(this.leftMap, this.split, false);
        this.updateTargetVisibility(this.rightMap, this.split, true);
      });
    }

    updateTargetVisibility(map, split, rightSide) {
      const frame = map.svg.getBoundingClientRect();
      if (!frame.width || !frame.height) return;
      const cut = frame.left + frame.width * split / 100;
      const left = rightSide ? cut : frame.left;
      const right = rightSide ? frame.right : cut;
      for (const item of map.svg.querySelectorAll('[role="button"][data-region]')) {
        const position = item.getBoundingClientRect();
        const available = left < right && position.left < right && position.right > left
          && position.top < frame.bottom && position.bottom > frame.top;
        item.setAttribute('tabindex', available ? '0' : '-1');
        if (available) item.removeAttribute('aria-hidden');
        else item.setAttribute('aria-hidden', 'true');
      }
    }

    restoreLeftTargets() {
      for (const item of this.leftMap.svg.querySelectorAll('[role="button"][data-region]')) {
        item.setAttribute('tabindex', '0');
        item.removeAttribute('aria-hidden');
      }
    }
  }

  window.AtlasComparison = AtlasComparison;
})();
