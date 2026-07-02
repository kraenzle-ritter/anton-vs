// Pure (no vscode import) text-mode logic ported from anton-oxy's RefTargets.java.
//
// Given the document text and a caret offset it locates the nearest enclosing
// mapped element, rebuilds its start tag with a new attribute value, wraps a bare
// selection in a fresh element, and finds the next verbatim occurrence for serial
// tagging. Keeping this vscode-free lets the offline tests exercise it directly.

export interface Target {
    register: string;
    attribute: string;
}

/** An element located under the caret that should receive an Anton reference. */
export interface ElementTarget {
    kind: "element";
    register: string;
    attribute: string;
    elementName: string;
    currentText: string;   // inner text, for pre-filling the search field
    currentRef?: string;   // existing attribute value, if any
    tagStart: number;      // offset of '<'
    tagEnd: number;        // offset of the start tag's '>'
    tag: string;           // the verbatim start tag, e.g. `<persName ...>`
}

/** A bare text selection to be wrapped in a fresh element (the "Wrap & Tag" flow). */
export interface SelectionTarget {
    kind: "selection";
    start: number;
    end: number;
    selectedText: string;
}

export type LocatedTarget = ElementTarget | SelectionTarget;

/** Collapse whitespace and clip to 80 chars, like RefTargets.collapse. */
export function collapse(s: string | null | undefined): string {
    if (!s) {
        return "";
    }
    s = s.replace(/\s+/g, " ").trim();
    return s.length > 80 ? s.substring(0, 80).trim() : s;
}

export function escapeAttr(s: string | null | undefined): string {
    if (!s) {
        return "";
    }
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

/** Last index of a real start tag `<name` at or before `pos`. */
function lastStartTag(text: string, name: string, pos: number): number {
    const token = "<" + name;
    let from = Math.min(pos, text.length - 1);
    while (from >= 0) {
        const idx = text.lastIndexOf(token, from);
        if (idx < 0) {
            return -1;
        }
        const after = idx + token.length;
        const c = after < text.length ? text.charAt(after) : " ";
        if (c === " " || c === "\t" || c === "\r" || c === "\n" || c === ">" || c === "/") {
            return idx;
        }
        from = idx - 1; // false positive (e.g. <placeNameX) -> keep looking
    }
    return -1;
}

export function indexOfCloseTag(text: string, name: string, from: number): number {
    const re = new RegExp("</" + escapeRegExp(name) + "\\s*>");
    const slice = text.slice(from);
    const m = re.exec(slice);
    return m ? from + m.index : -1;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function innerText(text: string, name: string, close: number): string {
    let end = indexOfCloseTag(text, name, close);
    if (end < 0) {
        end = Math.min(text.length, close + 200);
    }
    return text.substring(close + 1, end).replace(/<[^>]*>/g, " ");
}

/**
 * Locate the nearest mapped element enclosing `caret`, or null.
 *
 * @param selectedText inner text to prefer over the element's text (a selection
 *                     inside the element pre-fills the search with exactly that).
 */
export function locateElement(
    text: string,
    caret: number,
    targets: Map<string, Target>,
    selectedText?: string
): ElementTarget | null {
    // Find the nearest preceding start tag of any mapped element.
    let open = -1;
    let name: string | null = null;
    for (const n of targets.keys()) {
        const idx = lastStartTag(text, n, caret);
        if (idx > open) {
            open = idx;
            name = n;
        }
    }
    if (open < 0 || name === null) {
        return null;
    }
    const close = text.indexOf(">", open);
    if (close < 0) {
        return null;
    }
    // Ensure the caret is actually inside this element (not past its close tag).
    if (caret > close) {
        const closeTag = indexOfCloseTag(text, name, close);
        if (closeTag >= 0 && caret > closeTag) {
            return null;
        }
    }
    const t = targets.get(name);
    if (!t) {
        return null;
    }
    const inner = selectedText && selectedText.trim() !== ""
        ? selectedText
        : innerText(text, name, close);
    const tag = text.substring(open, close + 1);
    return {
        kind: "element",
        register: t.register,
        attribute: t.attribute,
        elementName: name,
        currentText: collapse(inner),
        currentRef: readAttr(tag, t.attribute) ?? undefined,
        tagStart: open,
        tagEnd: close,
        tag
    };
}

function attrPattern(attr: string): RegExp {
    return new RegExp("\\s" + escapeRegExp(attr) + "\\s*=\\s*(\"[^\"]*\"|'[^']*')", "s");
}

export function readAttr(tag: string, attr: string): string | null {
    const m = attrPattern(attr).exec(tag);
    if (m) {
        const q = m[1];
        return q.substring(1, q.length - 1);
    }
    return null;
}

/**
 * Rebuild a start tag so `attr` carries `value`, preserving every other attribute.
 * Replaces an existing occurrence in place, otherwise inserts right after the
 * element name. Handles self-closing tags. Port of TextRefTarget.buildTag.
 */
export function buildTag(startTag: string, attr: string, value: string): string {
    const selfClose = startTag.endsWith("/>");
    let body = startTag.substring(1, selfClose ? startTag.length - 2 : startTag.length - 1);
    const attrText = " " + attr + '="' + escapeAttr(value) + '"';
    const m = attrPattern(attr).exec(body);
    if (m) {
        body = body.substring(0, m.index) + attrText + body.substring(m.index + m[0].length);
    } else {
        const nm = /^(\s*[\w:.\-]+)/.exec(body);
        if (nm) {
            body = body.substring(0, nm[0].length) + attrText + body.substring(nm[0].length);
        } else {
            body = body + attrText;
        }
    }
    return "<" + body + (selfClose ? "/>" : ">");
}

/** Build a `<element attr="value">selected</element>` wrapper. Port of TextWrapTarget.wrap. */
export function wrapFragment(elementName: string, attr: string, value: string, selected: string): string {
    const open = "<" + elementName + " " + attr + '="' + escapeAttr(value) + '">';
    const close = "</" + elementName + ">";
    return open + selected + close;
}

/** Next verbatim occurrence of `surface` at or after `from`, or -1. */
export function findNext(text: string, surface: string, from: number): number {
    if (!surface || from < 0) {
        return -1;
    }
    return text.indexOf(surface, Math.min(from, text.length));
}
