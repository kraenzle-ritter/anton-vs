// vscode-facing configuration: reads the `anton.*` workspace settings and delegates
// mapping/template logic to configCore. Mirrors Config.java's getters.

import * as vscode from "vscode";
import { AntonEntity } from "./types";
import { Target } from "./refTargets";
import { DEFAULT_MAPPING, formatRef, parseMapping, registersOf } from "./configCore";

export class Config {
    private get cfg(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration("anton");
    }

    get baseUrl(): string {
        const v = this.cfg.get<string>("baseUrl", "https://kr.anton.ch");
        return (v || "https://kr.anton.ch").replace(/\/+$/, "");
    }

    get perPage(): number {
        const n = this.cfg.get<number>("perPage", 30);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
    }

    get insecureTls(): boolean {
        return this.cfg.get<boolean>("insecureTls", false);
    }

    get attribute(): string {
        const v = (this.cfg.get<string>("attribute", "ref") || "").trim();
        return v || "ref";
    }

    get template(): string {
        const v = (this.cfg.get<string>("template", "{fullId}") || "").trim();
        return v || "{fullId}";
    }

    get mapping(): string[] {
        const v = this.cfg.get<string[]>("mapping", DEFAULT_MAPPING);
        return v && v.length ? v : DEFAULT_MAPPING;
    }

    get targets(): Map<string, Target> {
        return parseMapping(this.mapping, this.attribute);
    }

    get registers(): string[] {
        return registersOf(this.targets);
    }

    formatRef(e: AntonEntity): string {
        return formatRef(this.template, e);
    }
}
