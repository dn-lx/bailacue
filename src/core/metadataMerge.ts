import { canonical, type PortableLibrary } from "./backups";
export type MergeResult = { library: PortableLibrary; conflicts: string[] };
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
/** Three-way merge: disjoint field edits combine; concurrent edits require review. */
export function mergeMetadata(
  base: PortableLibrary,
  phone: PortableLibrary,
  sheet: PortableLibrary,
  choice?: "phone" | "sheet",
): MergeResult {
  const conflicts: string[] = [];
  function merge(b: any, l: any, r: any, path: string): any {
    if (same(l, r) || same(r, b)) return l;
    if (same(l, b)) return r;
    if (Array.isArray(l) && Array.isArray(r) && Array.isArray(b)) {
      const field = path === "picks" ? "day" : "id";
      if (
        [...l, ...r, ...b].every(
          (v) => v && typeof v === "object" && typeof v[field] === "string",
        )
      ) {
        const bm = new Map(b.map((v) => [v[field], v])),
          lm = new Map(l.map((v) => [v[field], v])),
          rm = new Map(r.map((v) => [v[field], v]));
        return [...new Set([...l, ...r, ...b].map((v) => v[field]))]
          .map((id) =>
            merge(bm.get(id), lm.get(id), rm.get(id), path + "." + id),
          )
          .filter((v) => v !== undefined);
      }
    }
    if (
      l &&
      r &&
      typeof l === "object" &&
      typeof r === "object" &&
      !Array.isArray(l) &&
      !Array.isArray(r) &&
      (b === undefined || (b && typeof b === "object" && !Array.isArray(b)))
    ) {
      const result: Record<string, unknown> = {};
      for (const key of new Set([
        ...Object.keys(b ?? {}),
        ...Object.keys(l),
        ...Object.keys(r),
      ])) {
        const value = merge(
          b?.[key],
          l[key],
          r[key],
          path ? path + "." + key : key,
        );
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    conflicts.push(path);
    return choice === "sheet" ? r : l;
  }
  return { library: merge(base, phone, sheet, ""), conflicts };
}
