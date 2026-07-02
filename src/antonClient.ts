// Thin HTTP client for Anton's public search API — port of AntonClient.java.
//
// One live GET {base}/api/{register}?format=json&perPage=N&search=... per query.
// It never bulk-downloads a register. The search endpoints are public, so no
// authentication is sent. Uses Node's http/https so we control timeouts and can
// opt into lenient TLS for local DDEV/mkcert hosts.

import * as http from "http";
import * as https from "https";
import { URL } from "url";
import { AntonEntity } from "./types";

export interface ClientConfig {
    baseUrl: string;
    perPage: number;
    insecureTls: boolean;
}

export async function search(
    register: string,
    query: string,
    cfg: ClientConfig,
    signal?: { aborted: boolean }
): Promise<AntonEntity[]> {
    const url = cfg.baseUrl
        + "/api/" + register
        + "?format=json"
        + "&perPage=" + cfg.perPage
        + "&search=" + encodeURIComponent(query ?? "");

    const body = await httpGet(url, cfg.insecureTls);
    if (signal?.aborted) {
        return [];
    }
    return parse(register, body);
}

function httpGet(urlStr: string, insecure: boolean): Promise<string> {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const lib = u.protocol === "https:" ? https : http;
        const opts: https.RequestOptions = {
            method: "GET",
            headers: { Accept: "application/json" },
            timeout: 15000
        };
        if (u.protocol === "https:" && insecure) {
            (opts as https.RequestOptions).rejectUnauthorized = false;
        }
        const req = lib.request(u, opts, (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c) => chunks.push(c as Buffer));
            res.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf8");
                const code = res.statusCode ?? 0;
                if (code < 200 || code >= 300) {
                    reject(new Error("Anton HTTP " + code + " für " + urlStr + "\n" + shorten(text)));
                } else {
                    resolve(text);
                }
            });
        });
        req.on("error", (e) => reject(friendlyNetworkError(e, u)));
        req.on("timeout", () => req.destroy(new Error("Anton timeout: " + urlStr)));
        req.end();
    });
}

// Map the most common Node TLS/DNS failures to an actionable hint that names
// anton.baseUrl — the setting the user almost always has to fix (e.g. a host not
// covered by the certificate, as happens with a mistyped tenant subdomain).
function friendlyNetworkError(e: any, u: URL): Error {
    const code = e?.code as string | undefined;
    const host = u.hostname;
    switch (code) {
        case "ERR_TLS_CERT_ALTNAME_INVALID":
            return new Error(
                `Der Hostname „${host}“ passt nicht zum TLS-Zertifikat des Servers. `
                + `Prüfe „anton.baseUrl“ (Tippfehler im Tenant-Namen?). `
                + `Für lokale Test-Hosts kann „anton.insecureTls“ aktiviert werden.\n${e.message}`
            );
        case "ENOTFOUND":
        case "EAI_AGAIN":
            return new Error(`Host „${host}“ nicht erreichbar (DNS). Prüfe „anton.baseUrl“.\n${e.message}`);
        case "DEPTH_ZERO_SELF_SIGNED_CERT":
        case "SELF_SIGNED_CERT_IN_CHAIN":
        case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
            return new Error(
                `Das TLS-Zertifikat von „${host}“ ist nicht vertrauenswürdig. `
                + `Für lokale DDEV/mkcert-Hosts „anton.insecureTls“ aktivieren.\n${e.message}`
            );
        case "ECONNREFUSED":
            return new Error(`Verbindung zu „${host}“ abgelehnt. Läuft der Anton-Server unter „anton.baseUrl“?\n${e.message}`);
        default:
            return e instanceof Error ? e : new Error(String(e));
    }
}

function parse(register: string, body: string): AntonEntity[] {
    const out: AntonEntity[] = [];
    let root: any;
    try {
        root = JSON.parse(body);
    } catch {
        return out;
    }
    const data = root?.data;
    if (!Array.isArray(data)) {
        return out;
    }
    for (const m of data) {
        if (!m || typeof m !== "object") {
            continue;
        }
        const fullId = str(m.full_id);
        if (!fullId) {
            continue;
        }
        const id = typeof m.id === "number" ? m.id : 0;
        const label = firstNonEmpty(m, "fullname", "name", "label");
        const type = firstNonEmpty(m, "authority_type", "type");
        const detail = register === "places" ? placeDetail(m) : "";
        const permalink = str(m.permalink);
        out.push({ id, fullId, label, type, detail, register, permalink });
    }
    return out;
}

function firstNonEmpty(m: any, ...keys: string[]): string {
    for (const k of keys) {
        const v = str(m[k]);
        if (v) {
            return v;
        }
    }
    return "";
}

function placeDetail(m: any): string {
    const parts = [str(m.city), str(m.state), str(m.country)].filter((p) => p);
    return parts.join(", ");
}

function str(o: any): string {
    return o === null || o === undefined ? "" : String(o);
}

function shorten(s: string): string {
    if (!s) {
        return "";
    }
    s = s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return s.length > 240 ? s.substring(0, 240) + "…" : s;
}
