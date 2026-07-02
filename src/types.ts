// One search hit returned by Anton (an actor, place or keyword).
//
// `fullId` is the value written into the TEI attribute (default @ref),
// e.g. `{slug}-actors-123`. Anton already returns the project slug as part
// of `full_id`, so the extension never assembles it itself.
export interface AntonEntity {
    id: number;
    fullId: string;
    label: string;
    type: string;    // Anton authority_type, e.g. "Person" / "Körperschaft" / ""
    detail: string;  // optional extra info (place: city/state/country), may be empty
    register: string; // "actors" | "places" | "keywords" | ...
    permalink: string; // human-facing Anton detail page, e.g. https://kr.anton.ch/actors/2 (may be empty)
}

/** Human-readable one-line label for the results list, mirroring AntonEntity.toString(). */
export function entityLabel(e: AntonEntity): string {
    let s = e.label && e.label.length ? e.label : e.fullId;
    if (e.detail) {
        s += ", " + e.detail;
    }
    if (e.type) {
        s += "  [" + e.type + "]";
    }
    return s;
}
