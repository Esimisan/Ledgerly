function normalise(path) {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function segments(path) {
  const p = normalise(path);
  return p === "/" ? [] : p.slice(1).split("/");
}

function matches(pattern, path) {
  const a = segments(pattern);
  const b = segments(path);
  if (a.length !== b.length) return false;
  return a.every((seg, i) =>
    seg.startsWith(":") ? b[i] !== "" : seg === b[i],
  );
}

// Returns the tour key for a pathname, or null when the page has no tour.
export function matchTourKey(pathname, routes) {
  for (const r of routes) {
    if (matches(r.pattern, pathname)) return r.key;
  }
  return null;
}

// Steps this person may see (a step can carry a `permission`).
export function visibleSteps(tour, can) {
  return (tour?.steps ?? []).filter((s) => !s.permission || can(s.permission));
}
