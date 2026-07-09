// ─────────────────────────────────────────────────────────────────────────────
// CardCanvas — the single source of truth for how a card LOOKS. It renders one
// side of a template against an employee, in the card's design-space pixels,
// using inline styles only (so html2canvas-pro captures it deterministically for
// PDF/PNG export). It powers gallery thumbnails, the live preview, the interactive
// designer (editing=true wraps each element in DraggableElement) AND offscreen
// export capture (scale=1, no transform).
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import type { CardElement, CardTemplate, CardTheme, CardSide } from '@/types/cardDesigner';
import { cardDimensions } from '@/types/cardDesigner';
import { bindField, type BindContext } from '@/utils/cardFields';
import { DraggableElement } from './DraggableElement';

const FONT = "'Segoe UI', system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif";

function tintColor(tint: CardElement['tint'], theme: CardTheme): string | undefined {
  switch (tint) {
    case 'primary': return theme.primary;
    case 'secondary': return theme.secondary;
    case 'accent': return theme.accent;
    case 'text': return theme.text;
    case 'bg': return theme.bg;
    default: return undefined;
  }
}
/** Substitute $primary/$secondary/$accent/$bg/$text tokens inside a CSS string. */
export function applyThemeCss(css: string | undefined, theme: CardTheme): string {
  if (!css) return '';
  return css
    .replace(/\$primary/g, theme.primary)
    .replace(/\$secondary/g, theme.secondary)
    .replace(/\$accent/g, theme.accent)
    .replace(/\$text/g, theme.text)
    .replace(/\$bg/g, theme.bg);
}

interface ElementViewProps { el: CardElement; ctx: BindContext; theme: CardTheme; editing: boolean; }
const ElementView: React.FC<ElementViewProps> = ({ el, ctx, theme, editing }) => {
  const st = el.style || {};
  const color = st.color || tintColor(el.tint, theme) || theme.text;

  if (el.type === 'box') {
    return <div style={{ width: '100%', height: '100%', background: applyThemeCss(st.background, theme) || tintColor(el.tint, theme) || theme.primary, borderRadius: st.radius ?? 0, opacity: st.opacity ?? 1, border: st.borderWidth ? `${st.borderWidth}px solid ${st.borderColor || color}` : undefined, boxSizing: 'border-box' }} />;
  }
  if (el.type === 'divider') {
    return <div style={{ width: '100%', height: '100%', background: color, borderRadius: st.radius ?? 0, opacity: st.opacity ?? 1 }} />;
  }

  const bound = bindField(el, ctx);

  // Images (photo, logo, signature, qr, barcode, background, watermark).
  const isImageType = ['photo', 'companyLogo', 'signature', 'qr', 'barcode', 'backgroundImage', 'watermark'].includes(el.type);
  if (isImageType) {
    if (bound.kind === 'image' && bound.src) {
      const isWm = el.type === 'watermark';
      return <img src={bound.src} crossOrigin="anonymous" alt="" style={{ width: '100%', height: '100%', objectFit: st.objectFit || (el.type === 'photo' ? 'cover' : 'contain'), borderRadius: st.radius ?? (el.type === 'photo' ? 8 : 0), opacity: isWm ? (st.opacity ?? 0.07) : (st.opacity ?? 1), display: 'block' }} />;
    }
    // Placeholder for photo / logo (monogram); hide other empty images unless editing.
    if (el.type === 'photo' || el.type === 'companyLogo') {
      return (
        <div style={{ width: '100%', height: '100%', borderRadius: st.radius ?? (el.type === 'photo' ? 8 : 6), background: theme.accent, color: theme.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: Math.min(el.w, el.h) * 0.4, boxSizing: 'border-box' }}>
          {bound.initials || '?'}
        </div>
      );
    }
    if (!editing) return null;
    return <div style={{ width: '100%', height: '100%', border: '1px dashed rgba(100,116,139,.5)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 9 }}>{el.type}</div>;
  }

  // Text-like fields.
  if (bound.kind === 'none') {
    if (!editing) return null;
    return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', color: '#d1d5db', fontSize: Math.max(8, st.fontSize || 11), fontStyle: 'italic', fontFamily: FONT, justifyContent: st.align === 'center' ? 'center' : st.align === 'right' ? 'flex-end' : 'flex-start' }}>{el.text || bound.label || el.type}</div>;
  }

  const value = st.uppercase ? (bound.value || '').toUpperCase() : bound.value;
  const alignItems = st.align === 'center' ? 'center' : st.align === 'right' ? 'flex-end' : 'flex-start';
  const chipBg = applyThemeCss(st.background, theme);
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems, textAlign: st.align || 'left', fontFamily: FONT, overflow: 'hidden', background: chipBg || undefined, borderRadius: chipBg ? (st.radius ?? 6) : st.radius, padding: chipBg ? '0 6px' : undefined, border: st.borderWidth ? `${st.borderWidth}px solid ${st.borderColor || color}` : undefined, boxSizing: 'border-box' }}>
      {bound.label && <span style={{ fontSize: Math.max(6, (st.fontSize || 11) * 0.62), color: st.color ? color : theme.secondary, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.8, lineHeight: 1 }}>{bound.label}</span>}
      <span style={{ fontSize: st.fontSize || 12, fontWeight: st.fontWeight ?? 600, fontStyle: st.fontStyle || 'normal', color, letterSpacing: st.letterSpacing, lineHeight: st.lineHeight ?? 1.15, opacity: st.opacity ?? 1, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: Math.max(1, Math.floor(el.h / ((st.fontSize || 12) * 1.2))), WebkitBoxOrient: 'vertical' as any }}>{value}</span>
    </div>
  );
};

export interface CardCanvasProps {
  template: CardTemplate;
  side: CardSide;
  employee: any;
  branding: BindContext['branding'];
  companyId?: number | string;
  sample?: boolean;
  scale?: number;
  editing?: boolean;
  selectedId?: string | null;
  onSelectElement?: (id: string | null) => void;
  onChangeElement?: (id: string, patch: Partial<CardElement>) => void;
  innerRef?: React.Ref<HTMLDivElement>;
  className?: string;
  style?: React.CSSProperties;
}

export const CardCanvas: React.FC<CardCanvasProps> = ({
  template, side, employee, branding, companyId, sample, scale = 1,
  editing = false, selectedId, onSelectElement, onChangeElement, innerRef, className, style,
}) => {
  const dims = cardDimensions(template.size, template.orientation);
  const theme = template.theme;
  const ctx: BindContext = { employee, branding, companyId, sample };
  const bg = applyThemeCss(side === 'front' ? template.frontBg : template.backBg, theme) || theme.bg;

  const els = template.elements
    .filter((e) => e.side === side && (e.visible !== false || editing))
    .slice()
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  const inner = (
    <div
      ref={innerRef}
      onPointerDown={editing ? () => onSelectElement?.(null) : undefined}
      style={{
        position: 'relative', width: dims.w, height: dims.h, background: bg,
        borderRadius: template.size === 'CR80' || template.size === 'visitor' ? 12 : 8,
        overflow: 'hidden', boxSizing: 'border-box', fontFamily: FONT,
        color: theme.text, flex: '0 0 auto',
      }}
    >
      {els.map((el) => {
        const wrapStyle: React.CSSProperties = {
          position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h,
          transform: `rotate(${el.rotation || 0}deg)`, transformOrigin: 'center center',
          opacity: el.visible === false ? 0.35 : 1,
        };
        if (editing && onChangeElement && onSelectElement) {
          return (
            <DraggableElement key={el.id} el={el} scale={scale} selected={selectedId === el.id}
              onSelect={() => onSelectElement(el.id)} onChange={(patch) => onChangeElement(el.id, patch)}>
              <ElementView el={el} ctx={ctx} theme={theme} editing />
            </DraggableElement>
          );
        }
        return (
          <div key={el.id} style={wrapStyle}>
            <ElementView el={el} ctx={ctx} theme={theme} editing={false} />
          </div>
        );
      })}
    </div>
  );

  // Non-unit scale → wrap in a sized box and CSS-transform the design node.
  if (scale !== 1) {
    return (
      <div className={className} style={{ width: dims.w * scale, height: dims.h * scale, ...style }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: dims.w, height: dims.h }}>{inner}</div>
      </div>
    );
  }
  return <div className={className} style={style}>{inner}</div>;
};

export default CardCanvas;
