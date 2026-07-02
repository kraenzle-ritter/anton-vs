// anton-vs — VS Code port of the anton-oxy Oxygen plugin.
//
// Searches actors / places / keywords live in Anton and writes the matched id into a
// configurable attribute (default @ref) of the TEI element under the caret — or wraps a
// bare text selection in a chosen element carrying that reference ("Wrap & Tag").
// "Einfügen & weiter" tags every occurrence of the same text in a rhythm of pick → Enter.

import * as vscode from "vscode";
import { Config } from "./config";
import { search } from "./antonClient";
import { AntonEntity, entityLabel } from "./types";
import {
    buildTag,
    collapse,
    findNext,
    indexOfCloseTag,
    locateElement,
    removeAttr,
    wrapFragment
} from "./refTargets";

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("anton.tagReference", () => tagReference()),
        vscode.commands.registerCommand("anton.clearReference", () => clearReference()),
        vscode.commands.registerCommand("anton.openSettings", () =>
            vscode.commands.executeCommand("workbench.action.openSettings", "@ext:kr.anton-vs"))
    );
}

export function deactivate(): void {
    // nothing to clean up
}

/** Entry point: run tag operations back-to-back while the user keeps asking for the next hit. */
async function tagReference(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage("Anton: kein Editor geöffnet.");
        return;
    }
    const cfg = new Config();
    let preferElement: string | undefined;
    // Serial tagging: after each insert the user may ask to jump to the next occurrence
    // of the same text, which re-enters as a fresh selection -> wrap flow. preferElement
    // keeps the chosen wrap element sticky across rounds.
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const res = await tagOnce(editor, cfg, preferElement);
        if (!res.continued) {
            break;
        }
        preferElement = res.element;
    }
}

/** Remove the Anton reference attribute from the mapped element under the caret. */
async function clearReference(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage("Anton: kein Editor geöffnet.");
        return;
    }
    const cfg = new Config();
    const doc = editor.document;
    const caret = doc.offsetAt(editor.selection.start);
    const element = locateElement(doc.getText(), caret, cfg.targets);
    if (!element) {
        vscode.window.showInformationMessage(
            `Anton: Cursor in ein konfiguriertes Element setzen (${[...cfg.targets.keys()].join(", ")}), `
            + `um dessen Referenz zu entfernen.`
        );
        return;
    }
    if (!element.currentRef) {
        vscode.window.showInformationMessage(
            `Anton: „${element.elementName}“ hat kein @${element.attribute} zum Entfernen.`
        );
        return;
    }
    const newTag = removeAttr(element.tag, element.attribute);
    const range = new vscode.Range(
        doc.positionAt(element.tagStart),
        doc.positionAt(element.tagEnd + 1)
    );
    const ok = await editor.edit((eb) => eb.replace(range, newTag));
    if (!ok) {
        vscode.window.showErrorMessage("Anton: Referenz konnte nicht entfernt werden.");
        return;
    }
    vscode.window.showInformationMessage(
        `Anton: @${element.attribute} von „${element.elementName}“ entfernt.`
    );
}

interface TagResult {
    continued: boolean;
    element?: string;
}

async function tagOnce(
    editor: vscode.TextEditor,
    cfg: Config,
    preferElement: string | undefined
): Promise<TagResult> {
    const doc = editor.document;
    const text = doc.getText();
    const sel = editor.selection;
    const caret = doc.offsetAt(sel.start);
    const selText = sel.isEmpty ? undefined : doc.getText(sel);
    const targets = cfg.targets;

    const element = locateElement(text, caret, targets, selText);
    const wrapMode = element === null;

    if (!element && (!selText || selText.trim() === "")) {
        vscode.window.showInformationMessage(
            `Anton: Cursor in ein konfiguriertes Element setzen (${[...targets.keys()].join(", ")}) `
            + `— oder Text markieren, um ihn zu umschließen — und erneut auslösen.`
        );
        return { continued: false };
    }

    let register: string;
    let attribute: string;
    let elementName: string;
    let prefill: string;
    let currentRef: string | undefined;
    let surface: string;
    let wrapRange: vscode.Range | undefined;

    if (wrapMode) {
        const chosen = await pickWrapElement(targets, preferElement);
        if (!chosen) {
            return { continued: false };
        }
        elementName = chosen;
        const t = targets.get(chosen)!;
        register = t.register;
        attribute = t.attribute;
        prefill = collapse(selText!);
        surface = selText!;
        wrapRange = sel;
    } else {
        register = element!.register;
        attribute = element!.attribute;
        elementName = element!.elementName;
        prefill = element!.currentText;
        currentRef = element!.currentRef;
        surface = element!.currentText;
    }

    const picked = await pickEntity(cfg, register, prefill, elementName, currentRef);
    if (!picked) {
        return { continued: false };
    }

    const value = cfg.formatRef(picked.entity);

    let anchor: number;
    if (wrapMode) {
        const wrapped = wrapFragment(elementName, attribute, value, surface);
        const startOffset = doc.offsetAt(wrapRange!.start);
        const ok = await editor.edit((eb) => eb.replace(wrapRange!, wrapped));
        if (!ok) {
            vscode.window.showErrorMessage("Anton: Referenz konnte nicht eingefügt werden.");
            return { continued: false };
        }
        anchor = startOffset + wrapped.length;
    } else {
        const newTag = buildTag(element!.tag, attribute, value);
        const range = new vscode.Range(
            doc.positionAt(element!.tagStart),
            doc.positionAt(element!.tagEnd + 1)
        );
        const ok = await editor.edit((eb) => eb.replace(range, newTag));
        if (!ok) {
            vscode.window.showErrorMessage("Anton: Referenz konnte nicht gesetzt werden.");
            return { continued: false };
        }
        anchor = indexOfCloseTag(doc.getText(), elementName, element!.tagStart);
    }

    if (!picked.wantsNext) {
        return { continued: false };
    }

    const idx = surface.trim() === "" || anchor < 0
        ? -1
        : findNext(doc.getText(), surface, anchor);
    if (idx < 0) {
        vscode.window.showInformationMessage(
            `Anton: keine weiteren Vorkommen von „${collapse(surface)}“ gefunden.`
        );
        return { continued: false };
    }
    const next = new vscode.Selection(doc.positionAt(idx), doc.positionAt(idx + surface.length));
    editor.selection = next;
    editor.revealRange(next, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    return { continued: true, element: elementName };
}

/** Wrap mode: choose which element to wrap the selection in (register follows the choice). */
async function pickWrapElement(
    targets: Map<string, { register: string; attribute: string }>,
    preferElement: string | undefined
): Promise<string | undefined> {
    const keys = [...targets.keys()];
    const items: vscode.QuickPickItem[] = keys.map((k) => {
        const t = targets.get(k)!;
        return { label: k, description: `→ ${t.register}  @${t.attribute}` };
    });
    // Float the sticky element to the top so serial tagging keeps its rhythm.
    if (preferElement && keys.includes(preferElement)) {
        const i = items.findIndex((it) => it.label === preferElement);
        const [pref] = items.splice(i, 1);
        items.unshift(pref);
    }
    const chosen = await vscode.window.showQuickPick(items, {
        placeHolder: "Element zum Umschließen der Auswahl wählen",
        matchOnDescription: true
    });
    return chosen?.label;
}

interface EntityItem extends vscode.QuickPickItem {
    entity: AntonEntity;
}

interface EntityPick {
    entity: AntonEntity;
    wantsNext: boolean;
}

const CONTINUE_BUTTON: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon("arrow-right"),
    tooltip: "Einfügen & weiter (nächste Fundstelle taggen)"
};
const OPEN_BUTTON: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon("link-external"),
    tooltip: "In Anton öffnen (Detailseite im Browser)"
};
const SWITCH_BUTTON: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon("list-selection"),
    tooltip: "Register wechseln"
};

/**
 * Live search dialog. Results refresh as you type (debounced). Enter inserts the picked
 * hit; the ▶ button on a hit inserts it and jumps to the next occurrence of the same text.
 */
function pickEntity(
    cfg: Config,
    initialRegister: string,
    prefill: string,
    elementName: string,
    currentRef: string | undefined
): Promise<EntityPick | undefined> {
    return new Promise((resolve) => {
        const qp = vscode.window.createQuickPick<EntityItem>();
        const registers = cfg.registers;
        let register = initialRegister;
        let resolved = false;
        let switching = false;
        let queryToken = 0;
        let debounce: ReturnType<typeof setTimeout> | undefined;

        qp.matchOnDetail = true;
        qp.matchOnDescription = true;
        if (registers.length > 1) {
            qp.buttons = [SWITCH_BUTTON];
        }

        const refreshMeta = () => {
            qp.title = `Anton · ${elementName} · Register: ${register}`;
            qp.placeholder = "In Anton suchen…"
                + (currentRef ? `  (aktuell: ${currentRef})` : "");
        };

        const doSearch = (query: string) => {
            const token = ++queryToken;
            qp.busy = true;
            search(register, query, cfg, undefined)
                .then((hits) => {
                    if (token !== queryToken || resolved) {
                        return; // stale response
                    }
                    qp.items = hits.map((e) => toItem(e, currentRef, cfg));
                    qp.busy = false;
                })
                .catch((err) => {
                    if (token !== queryToken || resolved) {
                        return;
                    }
                    qp.busy = false;
                    qp.items = [];
                    vscode.window.showErrorMessage("Anton-Suche fehlgeschlagen: " + String(err?.message ?? err));
                });
        };

        qp.onDidChangeValue((v) => {
            if (debounce) {
                clearTimeout(debounce);
            }
            debounce = setTimeout(() => doSearch(v), 200);
        });

        qp.onDidAccept(() => {
            const item = qp.activeItems[0];
            if (item) {
                finish({ entity: item.entity, wantsNext: false });
            }
        });

        qp.onDidTriggerItemButton((e) => {
            if (e.button === CONTINUE_BUTTON) {
                finish({ entity: e.item.entity, wantsNext: true });
            } else if (e.button === OPEN_BUTTON && e.item.entity.permalink) {
                // Open the Anton detail page to verify the hit; keep the picker open.
                vscode.env.openExternal(vscode.Uri.parse(e.item.entity.permalink));
            }
        });

        qp.onDidTriggerButton(async (b) => {
            if (b === SWITCH_BUTTON) {
                switching = true;
                const reg = await vscode.window.showQuickPick(registers, {
                    placeHolder: `Register wählen (aktuell: ${register})`
                });
                switching = false;
                if (reg) {
                    register = reg;
                    refreshMeta();
                    doSearch(qp.value);
                }
                qp.show();
            }
        });

        qp.onDidHide(() => {
            if (switching) {
                return; // hidden only because the register sub-picker opened
            }
            finish(undefined);
        });

        const finish = (result: EntityPick | undefined) => {
            if (resolved) {
                return;
            }
            resolved = true;
            if (debounce) {
                clearTimeout(debounce);
            }
            qp.hide();
            qp.dispose();
            resolve(result);
        };

        refreshMeta();
        qp.value = prefill;
        qp.show();
        doSearch(prefill);
    });
}

function toItem(e: AntonEntity, currentRef: string | undefined, cfg: Config): EntityItem {
    const value = cfg.formatRef(e);
    const isCurrent = currentRef !== undefined && currentRef === value;
    return {
        label: entityLabel(e),
        description: isCurrent ? "● aktuell" : "",
        detail: "→ " + value,
        entity: e,
        buttons: e.permalink ? [OPEN_BUTTON, CONTINUE_BUTTON] : [CONTINUE_BUTTON],
        // Keep every server hit visible: the query already drove the search, so we must
        // not let VS Code's client-side fuzzy filter hide hits matched on alternative
        // names / variants whose label doesn't contain the typed substring.
        alwaysShow: true
    };
}
