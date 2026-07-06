// ─────────────────────────────────────────────────────────────────────────────
// A dependency-free drag / resize / rotate wrapper for card elements. Works in
// the card's DESIGN-space pixels; the parent canvas is CSS-scaled by `scale`, so
// screen-space pointer deltas are divided by `scale` to map back to design px.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useRef } from 'react';
import type { CardElement } from '@/types/cardDesigner';

interface Props {
  el: CardElement;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<CardElement>) => void;
  children: React.ReactNode;
}

type Handle = 'move' | 'rotate' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

const HANDLE: React.CSSProperties = {
  position: 'absolute', width: 10, height: 10, background: '#fff',
  border: '1.5px solid #4F7CFF', borderRadius: 2, zIndex: 5,
};

export const DraggableElement: React.FC<Props> = ({ el, scale, selected, onSelect, onChange, children }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const start = useRef<any>(null);

  const begin = useCallback((handle: Handle, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    const rect = wrapRef.current?.getBoundingClientRect();
    const centre = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: e.clientX, y: e.clientY };
    start.current = { handle, px: e.clientX, py: e.clientY, x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rotation || 0, centre };

    const move = (ev: PointerEvent) => {
      const s = start.current; if (!s) return;
      const dx = (ev.clientX - s.px) / scale;
      const dy = (ev.clientY - s.py) / scale;

      if (s.handle === 'move') { onChange({ x: Math.round(s.x + dx), y: Math.round(s.y + dy) }); return; }

      if (s.handle === 'rotate') {
        const rad = Math.atan2(ev.clientY - s.centre.y, ev.clientX - s.centre.x);
        let deg = Math.round(rad * 180 / Math.PI + 90); // handle sits above centre → 0°
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15; // snap with Shift
        onChange({ rotation: ((deg % 360) + 360) % 360 });
        return;
      }

      let { x, y, w, h } = s;
      const minW = 12, minH = 12;
      if (s.handle.includes('e')) w = Math.max(minW, s.w + dx);
      if (s.handle.includes('s')) h = Math.max(minH, s.h + dy);
      if (s.handle.includes('w')) { w = Math.max(minW, s.w - dx); x = s.x + (s.w - w); }
      if (s.handle.includes('n')) { h = Math.max(minH, s.h - dy); y = s.y + (s.h - h); }
      onChange({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    };
    const up = () => { start.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [el, scale, onChange, onSelect]);

  const corner = (h: Handle, css: React.CSSProperties): React.CSSProperties => ({ ...HANDLE, ...css, cursor: `${h}-resize` });

  return (
    <div
      ref={wrapRef}
      onPointerDown={(e) => begin('move', e)}
      style={{
        position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h,
        transform: `rotate(${el.rotation || 0}deg)`, transformOrigin: 'center center',
        cursor: 'move', outline: selected ? '1.5px solid #4F7CFF' : '1px dashed rgba(79,124,255,0.35)',
        outlineOffset: 1, boxSizing: 'border-box',
      }}
    >
      {children}
      {selected && (
        <>
          <div onPointerDown={(e) => begin('nw', e)} style={corner('nw', { left: -5, top: -5 })} />
          <div onPointerDown={(e) => begin('ne', e)} style={corner('ne', { right: -5, top: -5 })} />
          <div onPointerDown={(e) => begin('sw', e)} style={corner('sw', { left: -5, bottom: -5 })} />
          <div onPointerDown={(e) => begin('se', e)} style={corner('se', { right: -5, bottom: -5 })} />
          <div onPointerDown={(e) => begin('n', e)} style={corner('n', { left: '50%', marginLeft: -5, top: -5 })} />
          <div onPointerDown={(e) => begin('s', e)} style={corner('s', { left: '50%', marginLeft: -5, bottom: -5 })} />
          <div onPointerDown={(e) => begin('e', e)} style={corner('e', { right: -5, top: '50%', marginTop: -5 })} />
          <div onPointerDown={(e) => begin('w', e)} style={corner('w', { left: -5, top: '50%', marginTop: -5 })} />
          <div onPointerDown={(e) => begin('rotate', e)}
            style={{ position: 'absolute', left: '50%', marginLeft: -6, top: -26, width: 12, height: 12, borderRadius: '50%', background: '#4F7CFF', border: '2px solid #fff', cursor: 'grab', zIndex: 6 }} />
          <div style={{ position: 'absolute', left: '50%', top: -14, width: 1, height: 14, background: '#4F7CFF' }} />
        </>
      )}
    </div>
  );
};

export default DraggableElement;
