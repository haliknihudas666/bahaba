// ---------------------------------------------------------------------------
// Bahaba – Leaflet 1.9.x Defensive Intersects & Polyline Clipping Patch
// ---------------------------------------------------------------------------

/**
 * Resolves well-known Leaflet 1.9.4 edge-case bugs:
 * 1. `Bounds.prototype.intersects` throwing `Cannot read properties of undefined (reading 'x')`
 * 2. `Polyline.prototype._clipPoints` throwing when renderer bounds are unready
 * 3. `Path.prototype.onRemove` throwing `Cannot read properties of undefined (reading '_removePath')`
 *    when clearing layers or unmounting.
 */
export function patchLeafletBounds(L: any) {
  if (!L || typeof window === "undefined") return;

  // 1. Patch L.Bounds.prototype.intersects
  if (L.Bounds && L.Bounds.prototype && !(L.Bounds.prototype as any).__bahaba_intersects_patched__) {
    (L.Bounds.prototype as any).__bahaba_intersects_patched__ = true;
    const originalIntersects = L.Bounds.prototype.intersects;

    L.Bounds.prototype.intersects = function (otherBounds: any) {
      if (!this || !this.min || !this.max) {
        return false;
      }
      if (!otherBounds) {
        return false;
      }

      let b = otherBounds;
      if (L.toBounds && !(otherBounds instanceof L.Bounds)) {
        try {
          b = L.toBounds(otherBounds);
        } catch {
          return false;
        }
      }

      if (!b || !b.min || !b.max) {
        return false;
      }

      if (
        typeof this.min.x !== "number" ||
        typeof this.max.x !== "number" ||
        typeof b.min.x !== "number" ||
        typeof b.max.x !== "number"
      ) {
        return false;
      }

      return originalIntersects.call(this, b);
    };
  }

  // 2. Patch L.Polyline.prototype._clipPoints
  if (L.Polyline && L.Polyline.prototype && !(L.Polyline.prototype as any).__bahaba_clippoints_patched__) {
    (L.Polyline.prototype as any).__bahaba_clippoints_patched__ = true;
    const originalClipPoints = L.Polyline.prototype._clipPoints;

    L.Polyline.prototype._clipPoints = function () {
      if (this.options && this.options.noClip) {
        this._parts = this._rings || [];
        return;
      }

      const bounds = this._renderer ? this._renderer._bounds : null;
      if (
        !bounds ||
        !bounds.min ||
        !bounds.max ||
        !this._pxBounds ||
        !this._pxBounds.min ||
        !this._pxBounds.max
      ) {
        this._parts = this._rings || [];
        return;
      }

      try {
        originalClipPoints.call(this);
      } catch {
        this._parts = this._rings || [];
      }
    };
  }

  // 3. Patch L.Path.prototype.onRemove to guard against missing _renderer
  if (L.Path && L.Path.prototype && !(L.Path.prototype as any).__bahaba_onremove_patched__) {
    (L.Path.prototype as any).__bahaba_onremove_patched__ = true;
    const originalOnRemove = L.Path.prototype.onRemove;

    L.Path.prototype.onRemove = function () {
      try {
        if (this._renderer && typeof this._renderer._removePath === "function") {
          originalOnRemove.call(this);
        }
      } catch {
        // Suppress teardown exception if renderer was already detached
      }
    };
  }

  // 4. Patch L.DomEvent.off and removeListener to guard against undefined element / _leaflet_events
  if (L.DomEvent && !(L.DomEvent as any).__bahaba_domevent_patched__) {
    (L.DomEvent as any).__bahaba_domevent_patched__ = true;
    const originalOff = L.DomEvent.off;
    const safeOff = function (this: any, obj: any, types: any, fn: any, context: any) {
      if (!obj) return this;
      try {
        return originalOff.call(this, obj, types, fn, context);
      } catch {
        return this;
      }
    };
    L.DomEvent.off = safeOff;
    L.DomEvent.removeListener = safeOff;
  }

  // 5. Patch L.Marker.prototype.onRemove and _removeIcon to prevent teardown crashes on null _icon
  if (L.Marker && L.Marker.prototype && !(L.Marker.prototype as any).__bahaba_marker_patched__) {
    (L.Marker.prototype as any).__bahaba_marker_patched__ = true;
    const originalMarkerOnRemove = L.Marker.prototype.onRemove;
    const originalMarkerRemoveIcon = L.Marker.prototype._removeIcon;

    L.Marker.prototype.onRemove = function (this: any, map: any) {
      try {
        if (!this._icon && !this._map) return;
        originalMarkerOnRemove.call(this, map);
      } catch {
        // Suppress teardown exception
      }
    };

    if (originalMarkerRemoveIcon) {
      L.Marker.prototype._removeIcon = function (this: any) {
        try {
          if (!this._icon) return;
          originalMarkerRemoveIcon.call(this);
        } catch {
          // Suppress teardown exception
        }
      };
    }
  }
}
