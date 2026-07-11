// ─────────────────────────────────────────────────────────────────────────────
// RichTextToolbar — the Invoice Visual Designer's typography surface.
//
// It formats at one of two scopes, and says which one it is using:
//
//   • SELECTION — the inline editor is open and text is highlighted. Commands
//     wrap the selection in inline HTML (`<b>`, `<span style="…">`, `<ul>`),
//     which is stored in the block's text and dumped verbatim into the PDF.
//   • BLOCK — nothing is highlighted. Commands write CanvasElement properties,
//     which both the editor's inline style and `renderCanvasHtml` turn into the
//     same CSS declarations.
//
// Either way the value that renders on the canvas is the value that is saved and
// the value that prints. Nothing here knows about GST, totals, or numbering.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight,
  AlignJustify, List, ListOrdered, Minus, Plus, ChevronDown, Baseline,
  Highlighter, Braces, Paintbrush, Type,
} from 'lucide-react';
import { useDismissable } from '@/hooks/useDismissable';
import { getElementText, type CanvasElement } from './invoiceTemplate';
import {
  FONT_FAMILIES, FONT_SIZES, FONT_WEIGHTS, LINE_HEIGHTS, TEXT_TRANSFORMS,
  MIN_FONT_SIZE, MAX_FONT_SIZE, DEFAULT_FONT_CSS,
  THEME_COLORS, HIGHLIGHT_COLORS, TOKEN_GROUPS,
  loadRecentColors, pushRecentColor, isHexColor, toggleListHtml,
} from './richText';

// ── Selection helpers ────────────────────────────────────────────────────────

/** True when the caret sits inside `root` AND covers at least one character.
 *  A collapsed caret means "no selection" → commands fall back to block scope. */
function selectionInside(root: HTMLElement | null): boolean {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  return root.contains(range.commonAncestorContainer);
}

/**
 * Wrap the current selection in a `<span>` carrying `css`.
 *
 * `execCommand` has no "apply arbitrary style" verb, but `fontSize` reliably
 * splits the selection across existing inline tags and marks every resulting
 * fragment with `<font size="7">`. We then swap those markers for our span. This
 * is why `styleWithCSS` is forced OFF first: with it ON the marker comes back as
 * `font-size: xxx-large` on a span, which is not reliably queryable.
 */
function styleSelection(root: HTMLElement, css: Record<string, string>): void {
  document.execCommand('styleWithCSS', false, 'false');
  document.execCommand('fontSize', false, '7');

  const markers = [...root.querySelectorAll('font[size="7"]')];
  if (!markers.length) return;

  const spans: HTMLSpanElement[] = [];
  for (const marker of markers) {
    const span = document.createElement('span');
    for (const [prop, value] of Object.entries(css)) span.style.setProperty(prop, value);
    while (marker.firstChild) span.appendChild(marker.firstChild);
    marker.parentNode?.replaceChild(span, marker);
    spans.push(span);
  }

  // Replacing the nodes dropped the selection; put it back across what we made,
  // so a user can press Bold then Italic without re-highlighting.
  const sel = window.getSelection();
  const range = document.createRange();
  range.setStartBefore(spans[0]);
  range.setEndAfter(spans[spans.length - 1]);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

// ── Small primitives ─────────────────────────────────────────────────────────

/** Every control swallows mousedown. Without this the click blurs the inline
 *  editor, which commits the edit and destroys the selection being formatted. */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

const IconBtn: React.FC<{
  active?: boolean; disabled?: boolean; title: string;
  onClick: () => void; children: React.ReactNode;
}> = ({ active, disabled, title, onClick, children }) => (
  <button type="button" title={title} disabled={disabled}
    onMouseDown={keepFocus}
    onClick={onClick}
    className={`h-7 w-7 flex items-center justify-center rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed
      ${active ? 'bg-brand-100 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
    {children}
  </button>
);

const Popover: React.FC<{
  label: React.ReactNode; title: string; disabled?: boolean;
  width?: number; children: (close: () => void) => React.ReactNode;
}> = ({ label, title, disabled, width = 220, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, ref);

  return (
    <div ref={ref} className="relative">
      <button type="button" title={title} disabled={disabled}
        onMouseDown={keepFocus}
        onClick={() => setOpen(o => !o)}
        className={`h-7 px-1.5 flex items-center gap-1 rounded text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed
          ${open ? 'bg-brand-100 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
        {label}
        <ChevronDown size={11} className="text-slate-400" />
      </button>
      {open && (
        <div style={{ width }}
          className="absolute right-0 top-8 z-[120] bg-white border border-slate-200 rounded-lg shadow-xl p-2 max-h-72 overflow-y-auto">
          {children(close)}
        </div>
      )}
    </div>
  );
};

// ── Colour picker ────────────────────────────────────────────────────────────

const ColorPicker: React.FC<{
  value: string; swatches: string[]; allowClear?: boolean;
  onPick: (color: string) => void; close: () => void;
}> = ({ value, swatches, allowClear, onPick, close }) => {
  const [recents, setRecents] = useState<string[]>(loadRecentColors);
  const [hex, setHex] = useState(value && isHexColor(value) ? value : '#000000');

  const commit = (color: string) => {
    if (color !== 'transparent') setRecents(pushRecentColor(color));
    onPick(color);
    close();
  };

  const Swatch = ({ color }: { color: string }) => (
    <button type="button" title={color} onMouseDown={keepFocus} onClick={() => commit(color)}
      style={{ background: color === 'transparent' ? 'repeating-conic-gradient(#e2e8f0 0 25%, #fff 0 50%) 50%/8px 8px' : color }}
      className={`h-5 w-5 rounded border ${value === color ? 'ring-2 ring-brand-500 ring-offset-1' : 'border-slate-200'}`} />
  );

  return (
    <div className="space-y-2">
      <p className="text-[9px] font-bold uppercase text-slate-400">Theme Colors</p>
      <div className="grid grid-cols-6 gap-1">{swatches.map(c => <Swatch key={c} color={c} />)}</div>

      {recents.length > 0 && (
        <>
          <p className="text-[9px] font-bold uppercase text-slate-400 pt-1">Recent</p>
          <div className="grid grid-cols-6 gap-1">{recents.map(c => <Swatch key={c} color={c} />)}</div>
        </>
      )}

      <p className="text-[9px] font-bold uppercase text-slate-400 pt-1">Custom</p>
      <div className="flex items-center gap-1">
        <input type="color" value={isHexColor(hex) ? hex : '#000000'} onMouseDown={e => e.stopPropagation()}
          onChange={e => { setHex(e.target.value); }}
          className="h-7 w-8 border border-slate-200 rounded cursor-pointer p-0.5" />
        <input type="text" value={hex} placeholder="#RRGGBB" spellCheck={false}
          onChange={e => setHex(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && isHexColor(hex)) commit(hex.trim()); }}
          className="flex-1 min-w-0 border border-slate-200 rounded px-1.5 py-1 text-[11px] font-mono" />
        <button type="button" onMouseDown={keepFocus} disabled={!isHexColor(hex)}
          onClick={() => commit(hex.trim())}
          className="h-7 px-2 rounded bg-brand-600 text-white text-[10px] font-bold disabled:opacity-40">Set</button>
      </div>

      {allowClear && (
        <button type="button" onMouseDown={keepFocus} onClick={() => commit('transparent')}
          className="w-full text-[10px] font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 rounded py-1">
          No highlight
        </button>
      )}
    </div>
  );
};

/** Hoisted, not inlined in the toolbar body: a component declared during render
 *  is a new type on every render, so React unmounts and remounts its subtree —
 *  which would blur the font-size input on every keystroke. */
const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-0.5 flex-wrap">{children}</div>
);

const MenuItem: React.FC<{
  active?: boolean; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties;
}> = ({ active, onClick, children, style }) => (
  <button type="button" onMouseDown={keepFocus} onClick={onClick} style={style}
    className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-slate-100 ${active ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-slate-700'}`}>
    {children}
  </button>
);

// ── Toolbar ──────────────────────────────────────────────────────────────────

export interface RichTextToolbarProps {
  /** The element whose current style the controls reflect. */
  element: CanvasElement;
  /** How many elements a block-scope change will be applied to. */
  targetCount: number;
  disabled: boolean;
  /** The inline contentEditable, when one is open on this element. */
  editorRef: React.RefObject<HTMLDivElement | null>;
  editing: boolean;
  /** Write CanvasElement properties (block scope). */
  onStyle: (changes: Partial<CanvasElement>) => void;
  /** Replace the block's stored text outright (list toggle at block scope). */
  onSetText: (html: string) => void;
  /** Pull the live contentEditable HTML back into state after an inline command. */
  onEditorInput: () => void;
  onInsertToken: (token: string) => void;
  formatPainterActive: boolean;
  onToggleFormatPainter: () => void;
}

export const RichTextToolbar: React.FC<RichTextToolbarProps> = ({
  element, targetCount, disabled, editorRef, editing,
  onStyle, onSetText, onEditorInput, onInsertToken,
  formatPainterActive, onToggleFormatPainter,
}) => {
  // Re-read the selection on every selectionchange so B/I/U light up correctly
  // and so the scope badge tells the truth before the user clicks anything.
  const [hasSelection, setHasSelection] = useState(false);
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!editing) { setHasSelection(false); return; }
    const sync = () => { setHasSelection(selectionInside(editorRef.current)); forceRender(n => n + 1); };
    document.addEventListener('selectionchange', sync);
    sync();
    return () => document.removeEventListener('selectionchange', sync);
  }, [editing, editorRef]);

  const inline = editing && hasSelection;

  /** Run a native execCommand against the open editor and sync state. */
  const exec = (command: string, value?: string) => {
    const root = editorRef.current;
    if (!root) return;
    root.focus();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, value);
    onEditorInput();
  };

  /** Wrap the selection in a styled span and sync state. */
  const wrap = (css: Record<string, string>) => {
    const root = editorRef.current;
    if (!root) return;
    root.focus();
    styleSelection(root, css);
    onEditorInput();
  };

  const cmdActive = (command: string) => {
    if (!editing) return false;
    try { return document.queryCommandState(command); } catch { return false; }
  };

  // ── Bold / Italic / Underline / Strikethrough ──
  // Inline when text is highlighted; otherwise the property on the whole block.
  const decorations = (element.textDecoration || '').split(' ').filter(Boolean);
  const hasDecoration = (d: string) => decorations.includes(d);
  const toggleDecoration = (d: string) => {
    const next = hasDecoration(d) ? decorations.filter(x => x !== d) : [...decorations, d];
    onStyle({ textDecoration: next.join(' ') || 'none' });
  };

  const isBoldBlock = Number(element.fontWeight || 400) >= 600;
  const bold = () => inline ? exec('bold') : onStyle({ fontWeight: isBoldBlock ? '400' : '700' });
  const italic = () => inline ? exec('italic') : onStyle({ fontStyle: element.fontStyle === 'italic' ? 'normal' : 'italic' });
  const underline = () => inline ? exec('underline') : toggleDecoration('underline');
  const strike = () => inline ? exec('strikeThrough') : toggleDecoration('line-through');

  // ── Lists ──
  // With the editor open we let contentEditable build the list around the caret.
  // With the block merely selected there is no caret, so we rewrite the stored
  // HTML: `a<br/>b` ⇄ `<ul><li>a</li><li>b</li></ul>`.
  const list = (kind: 'ul' | 'ol') => {
    if (editing) exec(kind === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
    else onSetText(toggleListHtml(getElementText(element), kind));
  };

  // ── Font size ──
  const size = Number(element.fontSize || 12);
  const setSize = (v: number) => {
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(v || 0)));
    if (inline) wrap({ 'font-size': `${clamped}px` });
    else onStyle({ fontSize: clamped });
  };

  const fontLabel = FONT_FAMILIES.find(f => f.css === element.fontFamily)?.label || 'Default';
  const weightLabel = FONT_WEIGHTS.find(w => w.value === String(element.fontWeight || '400'))?.label || 'Regular';
  const transformLabel = TEXT_TRANSFORMS.find(t => t.value === (element.textTransform || 'none'))?.label || 'Normal';

  return (
    <div className={`space-y-1.5 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Scope badge. Formatting silently applying to the wrong thing is the
          single most confusing failure mode of a canvas text editor. */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-500 uppercase">Text</span>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
          {inline ? 'Selected text'
            : targetCount > 1 ? `${targetCount} blocks`
            : 'Whole block'}
        </span>
      </div>

      {/* Font family + size */}
      <Row>
        <Popover title="Font family" width={200}
          label={<span className="truncate max-w-[92px]" style={{ fontFamily: element.fontFamily || DEFAULT_FONT_CSS }}>{fontLabel}</span>}>
          {close => (
            <>
              <MenuItem active={!element.fontFamily} onClick={() => { onStyle({ fontFamily: undefined }); close(); }}>Default</MenuItem>
              {FONT_FAMILIES.map(f => (
                <MenuItem key={f.label} active={element.fontFamily === f.css} style={{ fontFamily: f.css }}
                  onClick={() => { inline ? wrap({ 'font-family': f.css }) : onStyle({ fontFamily: f.css }); close(); }}>
                  {f.label}
                </MenuItem>
              ))}
            </>
          )}
        </Popover>

        <div className="flex items-center border border-slate-200 rounded overflow-hidden h-7">
          <button type="button" title="Decrease size" onMouseDown={keepFocus} onClick={() => setSize(size - 1)}
            className="px-1 h-full text-slate-500 hover:bg-slate-100"><Minus size={11} /></button>
          <input type="number" min={MIN_FONT_SIZE} max={MAX_FONT_SIZE} value={size}
            onMouseDown={e => e.stopPropagation()}
            onChange={e => setSize(Number(e.target.value))}
            className="w-9 h-full text-center text-[11px] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
          <button type="button" title="Increase size" onMouseDown={keepFocus} onClick={() => setSize(size + 1)}
            className="px-1 h-full text-slate-500 hover:bg-slate-100"><Plus size={11} /></button>
        </div>

        <Popover title="Preset sizes" width={90} label={<Type size={12} />}>
          {close => FONT_SIZES.map(s => (
            <MenuItem key={s} active={s === size} onClick={() => { setSize(s); close(); }}>{s}px</MenuItem>
          ))}
        </Popover>
      </Row>

      {/* Weight + emphasis */}
      <Row>
        <Popover title="Font weight" width={140} label={<span className="truncate max-w-[70px]">{weightLabel}</span>}>
          {close => FONT_WEIGHTS.map(w => (
            <MenuItem key={w.value} active={String(element.fontWeight || '400') === w.value} style={{ fontWeight: w.value as any }}
              onClick={() => { inline ? wrap({ 'font-weight': w.value }) : onStyle({ fontWeight: w.value }); close(); }}>
              {w.label}
            </MenuItem>
          ))}
        </Popover>
        <div className="w-px h-5 bg-slate-200 mx-0.5" />
        <IconBtn title="Bold" active={inline ? cmdActive('bold') : isBoldBlock} onClick={bold}><Bold size={13} /></IconBtn>
        <IconBtn title="Italic" active={inline ? cmdActive('italic') : element.fontStyle === 'italic'} onClick={italic}><Italic size={13} /></IconBtn>
        <IconBtn title="Underline" active={inline ? cmdActive('underline') : hasDecoration('underline')} onClick={underline}><Underline size={13} /></IconBtn>
        <IconBtn title="Strikethrough" active={inline ? cmdActive('strikeThrough') : hasDecoration('line-through')} onClick={strike}><Strikethrough size={13} /></IconBtn>
      </Row>

      {/* Alignment + lists + colours */}
      <Row>
        {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight], ['justify', AlignJustify]] as const).map(([a, Icon]) => (
          <IconBtn key={a} title={`Align ${a}`} active={element.textAlign === a} onClick={() => onStyle({ textAlign: a })}>
            <Icon size={13} />
          </IconBtn>
        ))}
        <div className="w-px h-5 bg-slate-200 mx-0.5" />
        <IconBtn title="Bullet list" active={cmdActive('insertUnorderedList')} onClick={() => list('ul')}><List size={13} /></IconBtn>
        <IconBtn title="Numbered list" active={cmdActive('insertOrderedList')} onClick={() => list('ol')}><ListOrdered size={13} /></IconBtn>
        <div className="w-px h-5 bg-slate-200 mx-0.5" />

        <Popover title="Font color" width={200}
          label={<span className="flex items-center gap-0.5"><Baseline size={13} />
            <span className="h-1 w-3 rounded-sm" style={{ background: element.color || '#000000' }} /></span>}>
          {close => (
            <ColorPicker value={element.color || '#000000'} swatches={THEME_COLORS} close={close}
              onPick={c => inline ? wrap({ color: c }) : onStyle({ color: c })} />
          )}
        </Popover>

        <Popover title="Highlight / background" width={200}
          label={<span className="flex items-center gap-0.5"><Highlighter size={13} />
            <span className="h-1 w-3 rounded-sm border border-slate-200" style={{ background: element.bg || 'transparent' }} /></span>}>
          {close => (
            <ColorPicker value={element.bg || 'transparent'} swatches={HIGHLIGHT_COLORS} allowClear close={close}
              onPick={c => inline
                ? wrap({ 'background-color': c })
                : onStyle({ bg: c === 'transparent' ? undefined : c })} />
          )}
        </Popover>

        <IconBtn title={formatPainterActive ? 'Format painter armed — click a block to paint' : 'Copy formatting to another block'}
          active={formatPainterActive} onClick={onToggleFormatPainter}><Paintbrush size={13} /></IconBtn>
      </Row>

      {/* Spacing + transform + tokens */}
      <Row>
        <Popover title="Line height" width={110} label={<span className="text-[10px]">↕ {element.lineHeight ?? 1.5}</span>}>
          {close => LINE_HEIGHTS.map(lh => (
            <MenuItem key={lh} active={(element.lineHeight ?? 1.5) === lh} onClick={() => { onStyle({ lineHeight: lh }); close(); }}>{lh.toFixed(2)}</MenuItem>
          ))}
        </Popover>

        <div className="flex items-center border border-slate-200 rounded overflow-hidden h-7" title="Letter spacing (px)">
          <span className="px-1 text-[10px] text-slate-400">A↔</span>
          <button type="button" onMouseDown={keepFocus} onClick={() => onStyle({ letterSpacing: Number(((element.letterSpacing ?? 0) - 0.5).toFixed(2)) })}
            className="px-1 h-full text-slate-500 hover:bg-slate-100"><Minus size={11} /></button>
          <span className="w-7 text-center text-[10px]">{element.letterSpacing ?? 0}</span>
          <button type="button" onMouseDown={keepFocus} onClick={() => onStyle({ letterSpacing: Number(((element.letterSpacing ?? 0) + 0.5).toFixed(2)) })}
            className="px-1 h-full text-slate-500 hover:bg-slate-100"><Plus size={11} /></button>
        </div>

        <Popover title="Text transform" width={130} label={<span className="text-[10px] truncate max-w-[64px]">{transformLabel}</span>}>
          {close => TEXT_TRANSFORMS.map(t => (
            <MenuItem key={t.value} active={(element.textTransform || 'none') === t.value}
              onClick={() => { inline ? wrap({ 'text-transform': t.value }) : onStyle({ textTransform: t.value }); close(); }}>
              {t.label}
            </MenuItem>
          ))}
        </Popover>
      </Row>

      {/* Token picker — the tokens are resolved by fillCanvasTokens at render. */}
      <Popover title="Insert a dynamic value" width={210}
        label={<span className="flex items-center gap-1 text-[10px] font-semibold"><Braces size={12} /> Insert Token</span>}>
        {close => (
          <>
            {TOKEN_GROUPS.map(group => (
              <div key={group.label} className="mb-1">
                <p className="text-[9px] font-bold uppercase text-slate-400 px-2 pt-1">{group.label}</p>
                {group.tokens.map(t => (
                  <MenuItem key={t.token} onClick={() => { onInsertToken(t.token); close(); }}>
                    <span className="flex items-center justify-between gap-2">
                      <span>{t.label}</span>
                      <code className="text-[9px] text-slate-400">{`{{${t.token}}}`}</code>
                    </span>
                  </MenuItem>
                ))}
              </div>
            ))}
          </>
        )}
      </Popover>
    </div>
  );
};

export default RichTextToolbar;
