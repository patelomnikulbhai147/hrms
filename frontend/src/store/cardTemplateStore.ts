// ─────────────────────────────────────────────────────────────────────────────
// Card template store — merges the shipped built-in templates with a company's
// own persisted custom/edited templates (backend card_templates). Built-ins are
// read-only; saving an edited built-in creates a custom copy. All backend calls
// degrade gracefully so the designer still works (built-ins only) if the API is
// unavailable.
// ─────────────────────────────────────────────────────────────────────────────
import { api } from '@/api/apiClient';
import type { CardTemplate } from '@/types/cardDesigner';
import { BUILTIN_TEMPLATES, DEFAULT_TEMPLATE_ID, cloneTemplate } from '@/data/cardTemplates';

export interface TemplateSet {
  builtins: CardTemplate[];
  custom: CardTemplate[];
  all: CardTemplate[];
  defaultId: string;
}

function normaliseRow(row: any): CardTemplate {
  const spec = (row.spec && typeof row.spec === 'object') ? row.spec : {};
  return {
    ...spec,
    id: `db:${row.id}`,
    dbId: row.id,
    name: row.name || spec.name || 'Custom Template',
    category: row.category || spec.category || 'Custom',
    size: row.size || spec.size || 'CR80',
    orientation: row.orientation || spec.orientation || 'portrait',
    builtinId: row.builtinId || spec.builtinId,
    custom: true,
    isDefault: !!row.isDefault,
    shared: !!row.shared,
    companyId: row.companyId,
    updatedAt: row.updatedAt,
  } as CardTemplate;
}

/** Load built-ins + the company's persisted templates. */
export async function loadTemplates(): Promise<TemplateSet> {
  const builtins = BUILTIN_TEMPLATES;
  let custom: CardTemplate[] = [];
  try {
    const res = await api.cardTemplates.list();
    custom = (res?.templates || []).map(normaliseRow);
  } catch {
    custom = []; // API unavailable → built-ins still fully usable
  }
  const def = custom.find((t) => t.isDefault);
  const defaultId = def?.id || DEFAULT_TEMPLATE_ID;
  return { builtins, custom, all: [...custom, ...builtins], defaultId };
}

/** The payload sent to the backend for a template. */
function toPayload(t: CardTemplate) {
  const spec = cloneTemplate(t);
  delete (spec as any).dbId; delete (spec as any).isDefault; delete (spec as any).companyId; delete (spec as any).updatedAt; delete (spec as any).custom;
  return {
    id: t.dbId,
    name: t.name, category: t.category || 'Custom', size: t.size, orientation: t.orientation,
    builtinId: t.builtinId || null, spec,
  };
}

/** Create or update a custom template. Returns the normalised saved template. */
export async function saveCustomTemplate(t: CardTemplate): Promise<CardTemplate> {
  const saved = await api.cardTemplates.save(toPayload(t));
  return normaliseRow(saved);
}

export async function removeCustomTemplate(dbId: number): Promise<void> {
  await api.cardTemplates.remove(dbId);
}
export async function setDefaultTemplate(dbId: number): Promise<void> {
  await api.cardTemplates.setDefault(dbId);
}
export async function setTemplateShared(dbId: number, shared: boolean): Promise<void> {
  await api.cardTemplates.setShared(dbId, shared);
}

// ── Import / Export (JSON files) ──────────────────────────────────────────────
export function exportTemplateJson(t: CardTemplate) {
  const spec = cloneTemplate(t);
  delete (spec as any).dbId; delete (spec as any).companyId; delete (spec as any).isDefault;
  const blob = new Blob([JSON.stringify({ hrmsCardTemplate: 1, ...spec }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `card-template-${(t.name || 'template').replace(/\s+/g, '-').toLowerCase()}.json`;
  a.click();
}

export function parseImportedTemplate(json: any): CardTemplate | null {
  const t = json?.hrmsCardTemplate ? json : json;
  if (!t || !Array.isArray(t.elements) || !t.theme) return null;
  return {
    id: `import:${Date.now()}`,
    name: (t.name ? `${t.name} (Imported)` : 'Imported Template'),
    category: t.category || 'Custom',
    size: t.size || 'CR80',
    orientation: t.orientation || 'portrait',
    theme: t.theme,
    frontBg: t.frontBg, backBg: t.backBg,
    elements: t.elements,
    builtinId: t.builtinId,
    custom: true,
  };
}
