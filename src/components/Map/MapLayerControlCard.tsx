"use client";

// ---------------------------------------------------------------------------
// Bahaba – Map Layer Control Card with Interactive Toggle Switches
// ---------------------------------------------------------------------------

import { useState } from "react";

interface MapLayerControlCardProps {
  /** Flood Heatmap overlay active state */
  showHeatmap: boolean;
  onToggleHeatmap: () => void;
  /** UP NOAH Hazard PMTiles overlay active state */
  showHazard: boolean;
  onToggleHazard: () => void;
}

/**
 * Sleek, accessible iOS-style Toggle Switch
 */
function ToggleSwitch({
  checked,
  onChange,
  activeColor = "#fb923c",
  activeGlow = "rgba(249, 115, 22, 0.4)",
  id,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  activeColor?: string;
  activeGlow?: string;
  id: string;
  label: string;
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      type="button"
      style={{
        position: "relative",
        width: 38,
        height: 22,
        borderRadius: 9999,
        backgroundColor: checked ? activeColor : "rgba(30, 41, 59, 0.9)",
        border: checked
          ? `1.5px solid ${activeColor}`
          : "1.5px solid rgba(71, 85, 105, 0.6)",
        cursor: "pointer",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: checked ? `0 0 10px ${activeGlow}` : "inset 0 1px 2px rgba(0,0,0,0.4)",
        padding: 0,
        outline: "none",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: "block",
          width: 16,
          height: 16,
          borderRadius: "50%",
          backgroundColor: "#ffffff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          transform: checked ? "translateX(17px)" : "translateX(2px)",
          transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </button>
  );
}

export default function MapLayerControlCard({
  showHeatmap,
  onToggleHeatmap,
  showHazard,
  onToggleHazard,
}: MapLayerControlCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const activeCount = [showHeatmap, showHazard].filter(Boolean).length;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 62,
        left: 16,
        zIndex: 1000,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* ── COLLAPSED PILL TRIGGER ────────────────────────────────────────── */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 14,
            backgroundColor: "rgba(15, 23, 42, 0.94)",
            border: "1px solid rgba(51, 65, 85, 0.8)",
            color: "#f1f5f9",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            backdropFilter: "blur(16px)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(30, 41, 59, 0.98)";
            e.currentTarget.style.borderColor = "rgba(71, 85, 105, 1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(15, 23, 42, 0.94)";
            e.currentTarget.style.borderColor = "rgba(51, 65, 85, 0.8)";
          }}
          title="Open Map Layers & Overlays Control Card"
        >
          <span style={{ fontSize: 14 }}>🗺️</span>
          <span>Map Overlays</span>
          <span
            style={{
              padding: "1px 6px",
              borderRadius: 9999,
              backgroundColor: activeCount > 0 ? "rgba(14, 165, 233, 0.2)" : "rgba(71, 85, 105, 0.3)",
              border: activeCount > 0 ? "1px solid rgba(56, 189, 248, 0.4)" : "1px solid rgba(100, 116, 139, 0.3)",
              color: activeCount > 0 ? "#38bdf8" : "#94a3b8",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {activeCount}
          </span>
          <span style={{ fontSize: 10, color: "#64748b", marginLeft: 2 }}>▲</span>
        </button>
      )}

      {/* ── EXPANDED GLASSMORPHIC OVERLAYS CARD ──────────────────────────── */}
      {isExpanded && (
        <div
          style={{
            backgroundColor: "rgba(15, 23, 42, 0.94)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(51, 65, 85, 0.85)",
            borderRadius: 16,
            padding: "12px 14px",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.05)",
            width: 290,
            maxWidth: "calc(100vw - 32px)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          {/* Card Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid rgba(51, 65, 85, 0.6)",
              paddingBottom: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 14 }}>🗺️</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#f8fafc", letterSpacing: "0.01em" }}>
                Map Overlays
              </span>
              <span
                style={{
                  padding: "1px 6px",
                  borderRadius: 9999,
                  backgroundColor: "rgba(14, 165, 233, 0.15)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  color: "#38bdf8",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {activeCount} Active
              </span>
            </div>

            <button
              onClick={() => setIsExpanded(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                fontSize: 14,
                cursor: "pointer",
                padding: "2px 4px",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#f1f5f9")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
              title="Minimize Overlays Card"
            >
              ▼
            </button>
          </div>

          {/* Layer 1: Live Inundation Heatmap */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "8px 10px",
              borderRadius: 12,
              backgroundColor: showHeatmap ? "rgba(249, 115, 22, 0.08)" : "rgba(30, 41, 59, 0.3)",
              border: showHeatmap
                ? "1px solid rgba(249, 115, 22, 0.3)"
                : "1px solid rgba(51, 65, 85, 0.4)",
              transition: "all 0.2s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15 }}>🔥</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: showHeatmap ? "#fed7aa" : "#cbd5e1" }}>
                    Live Flood Heatmap
                  </div>
                  <div style={{ fontSize: 9.5, color: "#94a3b8" }}>
                    Telemetry & weather prediction
                  </div>
                </div>
              </div>

              <ToggleSwitch
                id="switch-flood-heatmap"
                label="Toggle Live Flood Heatmap"
                checked={showHeatmap}
                onChange={onToggleHeatmap}
                activeColor="#ea580c"
                activeGlow="rgba(234, 88, 12, 0.4)"
              />
            </div>

            {/* Sub-Legend for Heatmap */}
            {showHeatmap && (
              <div style={{ marginTop: 2, paddingTop: 4, borderTop: "1px dashed rgba(249, 115, 22, 0.25)" }}>
                <div
                  style={{
                    width: "100%",
                    height: 5,
                    borderRadius: 9999,
                    background: "linear-gradient(to right, #06b6d4, #38bdf8, #eab308, #f97316, #ef4444)",
                    marginBottom: 3,
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5, color: "#94a3b8" }}>
                  <span>Passable (&lt;5cm)</span>
                  <span>Half-Tire</span>
                  <span style={{ color: "#ef4444", fontWeight: 700 }}>Critical (&gt;30cm)</span>
                </div>
              </div>
            )}
          </div>

          {/* Layer 2: UP NOAH 100-Yr Hazard Zones */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "8px 10px",
              borderRadius: 12,
              backgroundColor: showHazard ? "rgba(14, 116, 144, 0.1)" : "rgba(30, 41, 59, 0.3)",
              border: showHazard
                ? "1px solid rgba(56, 189, 248, 0.35)"
                : "1px solid rgba(51, 65, 85, 0.4)",
              transition: "all 0.2s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15 }}>🌊</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: showHazard ? "#e0f2fe" : "#cbd5e1" }}>
                    NOAH 100-Yr Zones
                  </div>
                  <div style={{ fontSize: 9.5, color: "#94a3b8" }}>
                    Worst-case scenario polygons
                  </div>
                </div>
              </div>

              <ToggleSwitch
                id="switch-noah-hazard"
                label="Toggle NOAH Flood Hazard Zones"
                checked={showHazard}
                onChange={onToggleHazard}
                activeColor="#0284c7"
                activeGlow="rgba(2, 132, 199, 0.4)"
              />
            </div>

            {/* Sub-Legend for NOAH Hazard */}
            {showHazard && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 9,
                  color: "#cbd5e1",
                  marginTop: 2,
                  paddingTop: 4,
                  borderTop: "1px dashed rgba(56, 189, 248, 0.25)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: "#ef4444" }} />
                  <span>High (&gt;1.5m)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: "#f97316" }} />
                  <span>Med (0.5–1.5m)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: "#3b82f6" }} />
                  <span>Low (&lt;0.5m)</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
