"use client";

import { useState } from "react";

type Item = { id: string; src: string; caption?: string };

type Props = { items: Item[] };

function navButtonStyle(side: "left" | "right"): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    background: "rgba(11, 18, 16, 0.6)",
    color: "var(--paper)",
    border: "none",
    fontSize: "16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };
  return side === "left" ? { ...base, left: "6px" } : { ...base, right: "6px" };
}

export default function SwipeCarousel({ items }: Props) {
  const [index, setIndex] = useState(0);
  const [startX, setStartX] = useState<number | null>(null);

  if (items.length === 0) return null;
  const clampedIndex = Math.min(index, items.length - 1);
  const current = items[clampedIndex];

  function go(dir: 1 | -1) {
    setIndex((prev) => Math.min(items.length - 1, Math.max(0, prev + dir)));
  }

  function handlePointerDown(e: React.PointerEvent) {
    setStartX(e.clientX);
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (startX === null) return;
    const delta = e.clientX - startX;
    setStartX(null);
    if (Math.abs(delta) < 40) return;
    go(delta < 0 ? 1 : -1);
  }

  return (
    <div style={{ width: "320px", maxWidth: "100%" }}>
      <div
        style={{ position: "relative", cursor: "grab", touchAction: "pan-y" }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <img
          src={current.src}
          alt={`Slide ${clampedIndex + 1}`}
          draggable={false}
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            objectFit: "cover",
            display: "block",
            background: "var(--surface)",
          }}
        />
        {items.length > 1 && (
          <>
            <button onClick={() => go(-1)} disabled={clampedIndex === 0} style={navButtonStyle("left")}>
              ‹
            </button>
            <button
              onClick={() => go(1)}
              disabled={clampedIndex === items.length - 1}
              style={navButtonStyle("right")}
            >
              ›
            </button>
          </>
        )}
      </div>

      {items.length > 1 && (
        <div className="label-block" style={{ display: "flex", justifyContent: "center", gap: "6px" }}>
          {items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                border: "none",
                padding: 0,
                cursor: "pointer",
                background: i === clampedIndex ? "var(--paper)" : "rgba(244, 242, 236, 0.3)",
              }}
            />
          ))}
        </div>
      )}

      {current.caption && <p className="quote content-block">{current.caption}</p>}
    </div>
  );
}
