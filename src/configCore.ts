// Pure config helpers ported from anton-oxy's Config.java: parsing the
// element→register mapping and rendering the id-value template. The vscode-facing
// wrapper (config.ts) reads workspace settings and delegates here.

import { AntonEntity } from "./types";
import { Target } from "./refTargets";

export const DEFAULT_MAPPING = [
    "persName=actors",
    "orgName=actors",
    "placeName=places",
    "objectName=keywords",
    "term=keywords",
    "unit=keywords@corresp"
];

/**
 * Parse mapping lines (`element=register` with optional `@attribute` suffix) into
 * an ordered element→Target map. `#`-comments and blanks are skipped.
 */
export function parseMapping(lines: string[], defaultAttr: string): Map<string, Target> {
    const m = new Map<string, Target>();
    for (let line of lines) {
        line = line.trim();
        if (line === "" || line.startsWith("#")) {
            continue;
        }
        const eq = line.indexOf("=");
        if (eq < 0) {
            continue;
        }
        const tag = line.substring(0, eq).trim();
        const rhs = line.substring(eq + 1).trim();
        let reg = rhs;
        let attr = defaultAttr;
        const at = rhs.indexOf("@");
        if (at >= 0) {
            reg = rhs.substring(0, at).trim();
            const a = rhs.substring(at + 1).trim();
            if (a !== "") {
                attr = a;
            }
        }
        if (tag !== "" && reg !== "") {
            m.set(tag, { register: reg, attribute: attr });
        }
    }
    if (m.size === 0) {
        m.set("persName", { register: "actors", attribute: defaultAttr });
        m.set("orgName", { register: "actors", attribute: defaultAttr });
        m.set("placeName", { register: "places", attribute: defaultAttr });
    }
    return m;
}

/** Distinct registers in mapping order, e.g. ["actors", "places", "keywords"]. */
export function registersOf(targets: Map<string, Target>): string[] {
    const out: string[] = [];
    for (const t of targets.values()) {
        if (!out.includes(t.register)) {
            out.push(t.register);
        }
    }
    return out;
}

/**
 * Render the attribute value for an entity via the template.
 * Placeholders: {fullId} {slug} {register} {id}.
 */
export function formatRef(template: string, e: AntonEntity): string {
    const fullId = e.fullId;
    const register = e.register;
    let slug = "";
    let id = String(e.id);
    const marker = "-" + register + "-";
    const p = fullId.indexOf(marker);
    if (p >= 0) {
        slug = fullId.substring(0, p);
        id = fullId.substring(p + marker.length);
    }
    return template
        .replace(/\{fullId\}/g, fullId)
        .replace(/\{slug\}/g, slug)
        .replace(/\{register\}/g, register)
        .replace(/\{id\}/g, id);
}
