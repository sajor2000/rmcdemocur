/**
 * Curated per-course scope: the USMLE organ systems a course is actually meant
 * to teach. A single organ-system course should be measured only against its
 * own systems — every other system is "not in scope", NOT a gap. Measuring an
 * organ course against all 15 USMLE systems overstates failure and misleads the
 * curriculum committees who use this tool.
 *
 * Keyed by course code. A course with no entry falls back to the whole
 * framework (prior behavior), so uncurated/uploaded courses still work.
 *
 * RMD 563 "Food to Fuel" is a GI/metabolism course — its real coverage is
 * overwhelmingly Gastrointestinal (1534 alignments), Multisystem (698) and
 * Endocrine (681), then a cliff to Cardiovascular (179). Those three are its
 * scope; the rest are incidental cross-references.
 */
const COURSE_TARGET_SYSTEMS: Record<string, string[]> = {
  "RMD 563": [
    "Gastrointestinal System",
    "Endocrine System",
    "Multisystem Processes & Disorders",
  ],
};

/**
 * Which curricular module a course belongs to (M1, M2, …). The curriculum
 * hierarchy is chunk -> document/session -> course -> module -> program, and
 * coverage is reported at the program level AND per module. Curated by course
 * code; unmapped courses fall into "Unassigned". RMD 563 "Food to Fuel" is a
 * first-year (M1) organ-system block.
 */
const COURSE_MODULE: Record<string, string> = {
  "RMD 563": "M1",
};

export function courseModule(courseCode: string | null | undefined): string {
  if (!courseCode) return "Unassigned";
  return COURSE_MODULE[courseCode] ?? "Unassigned";
}

/** Course codes curated to a module label (M1, M2, …). */
export function courseCodesForModule(module: string): string[] {
  return Object.entries(COURSE_MODULE)
    .filter(([, m]) => m === module)
    .map(([code]) => code);
}

/** Course codes with an explicit module assignment in the curated map. */
export function curatedCourseCodesWithModule(): string[] {
  return Object.keys(COURSE_MODULE);
}

/** Target USMLE systems for a course, or null when none are curated (= all).
 * An empty array normalizes to null too — every caller treats a truthy
 * targetSystems as a non-empty SQL `IN (...)` list (an empty array would
 * produce invalid `IN ()` SQL), so there is no reachable "curated to zero
 * systems" state. */
export function courseTargetSystems(
  courseCode: string | null | undefined,
): string[] | null {
  if (!courseCode) return null;
  const systems = COURSE_TARGET_SYSTEMS[courseCode];
  return systems && systems.length > 0 ? systems : null;
}

/** The organ system a USMLE framework label belongs to ("System — sub" -> "System"). */
export function systemOfLabel(label: string | null | undefined): string {
  return (label ?? "").split(" — ")[0].trim();
}
