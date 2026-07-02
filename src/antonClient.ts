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
        req.on("error", reject);
        req.on("timeout", () => req.destroy(new Error("Anton timeout: " + urlStr)));
        req.end();
    });
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
        out.push({ id, fullId, label, type, detail, register });
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
