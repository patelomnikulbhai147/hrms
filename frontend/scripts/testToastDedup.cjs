// Logic regression for the toast de-duplication in components/ui/feedback.tsx.
// The frontend has no React test runner, so this mirrors the EXACT pushToast /
// dismissToast state machine (activeKeys map keyed on `${type} ${message}`,
// synchronous updates) and asserts the required behaviours:
//   1. N identical toasts fired at once  -> exactly ONE visible toast.
//   2. Different messages                -> shown separately (never merged).
//   3. Same type, different message      -> separate; different type, same text -> separate.
//   4. A repeated identical toast refreshes the timer, adds no duplicate.
//   5. After dismiss (auto or user) the key frees, so the SAME error can show again.
// Keep this in sync with feedback.tsx if that logic changes.
//   node scripts/testToastDedup.cjs

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { PASS++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); }
  else { FAIL++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};

// ── Mirror of feedback.tsx toast host (timer callbacks captured, not real) ──────
function makeHost() {
  let counter = 1;
  const toasts = [];                 // visible toasts (mirrors useState list)
  const activeKeys = new Map();      // `${type} ${message}` -> id
  const timers = {};                 // id -> "timer" (here: a dismiss thunk)
  const keyOf = (type, message) => `${type} ${message}`;

  const dismissToast = (id) => {
    const i = toasts.findIndex(x => x.id === id);
    if (i >= 0) toasts.splice(i, 1);
    if (timers[id]) delete timers[id];
    for (const [k, v] of activeKeys) { if (v === id) { activeKeys.delete(k); break; } }
  };

  const pushToast = (type, message, duration) => {
    const k = keyOf(type, message);
    const existingId = activeKeys.get(k);
    if (existingId != null) {
      // refresh timer, no duplicate
      timers[existingId] = () => dismissToast(existingId);
      return { added: false, id: existingId };
    }
    const t = { id: counter++, type, message, duration };
    activeKeys.set(k, t.id);
    toasts.push(t);
    timers[t.id] = () => dismissToast(t.id);
    return { added: true, id: t.id };
  };

  // simulate a timer or the close button firing
  const fireTimer = (id) => { if (timers[id]) timers[id](); };

  return { toasts, activeKeys, pushToast, dismissToast, fireTimer };
}

// 1) Four identical errors fired synchronously -> ONE toast.
{
  const h = makeHost();
  const MSG = 'This E-TimeOffice machine account is already connected to another company (#1).';
  const r = [0,1,2,3].map(() => h.pushToast('error', MSG));
  ok('4 identical errors -> exactly ONE visible toast', h.toasts.length === 1, `visible=${h.toasts.length}`);
  ok('only the first was added; rest de-duplicated', r.filter(x => x.added).length === 1);
  ok('all four resolve to the same toast id', new Set(r.map(x => x.id)).size === 1);
}

// 2) Different messages -> separate toasts.
{
  const h = makeHost();
  h.pushToast('error', 'Error A');
  h.pushToast('error', 'Error B');
  ok('two different errors -> two toasts', h.toasts.length === 2);
}

// 3) Same message different type, and same type different message -> separate.
{
  const h = makeHost();
  h.pushToast('error', 'Same text');
  h.pushToast('warning', 'Same text');   // different type
  h.pushToast('error', 'Other text');    // different message
  ok('type and message both part of the key', h.toasts.length === 3, `visible=${h.toasts.length}`);
}

// 4) Repeated identical after render still de-dups (no stacking over time).
{
  const h = makeHost();
  for (let i = 0; i < 10; i++) h.pushToast('error', 'Repeat me');
  ok('10 sequential identical -> still ONE toast', h.toasts.length === 1);
}

// 5) After dismiss, the SAME error can appear again (key freed).
{
  const h = makeHost();
  const first = h.pushToast('error', 'Reappear');
  ok('shown once', h.toasts.length === 1);
  h.fireTimer(first.id);                  // auto-dismiss or user close
  ok('dismiss removes the toast', h.toasts.length === 0);
  ok('dismiss frees the dedup key', h.activeKeys.size === 0);
  const second = h.pushToast('error', 'Reappear');
  ok('same error after dismissal shows again', h.toasts.length === 1 && second.added === true);
}

console.log(`\nTOAST DEDUP: ${PASS} passed, ${FAIL} failed`);
process.exit(FAIL ? 1 : 0);
