// Offline sanity checks (no network, no vscode) for the pure logic in src/, run
// against the compiled output in out/. Mirrors anton-oxy's ManualTest.java:
// mapping parsing + attribute overrides, id-value templates, element location with
// attribute preservation and nesting, Wrap & Tag escaping, and next-occurrence search.
//
//   npm test    (== tsc -p ./ && node test/manual.test.js)

const assert = require("assert");
const rt = require("../out/refTargets");
const cc = require("../out/configCore");

let passed = 0;
function check(name, fn) {
    try {
        fn();
        passed++;
        console.log("  ok  " + name);
    } catch (e) {
        console.error("FAIL  " + name + "\n      " + e.message);
        process.exitCode = 1;
    }
}

const targets = cc.parseMapping(cc.DEFAULT_MAPPING, "ref");

// --- mapping parsing ------------------------------------------------------

check("mapping maps persName -> actors@ref", () => {
    assert.deepStrictEqual(targets.get("persName"), { register: "actors", attribute: "ref" });
});

check("mapping honours @attribute override (unit -> keywords@corresp)", () => {
    assert.deepStrictEqual(targets.get("unit"), { register: "keywords", attribute: "corresp" });
});

check("mapping skips comments and blanks", () => {
    const m = cc.parseMapping(["# a comment", "", "persName=actors", "  ", "term=keywords"], "ref");
    assert.strictEqual(m.size, 2);
});

check("registersOf is distinct in order", () => {
    assert.deepStrictEqual(cc.registersOf(targets), ["actors", "places", "keywords"]);
});

// --- id-value template ----------------------------------------------------

const entity = { id: 123, fullId: "demo-actors-123", label: "Martin Luther", type: "Person", detail: "", register: "actors" };

check("formatRef {fullId}", () => {
    assert.strictEqual(cc.formatRef("{fullId}", entity), "demo-actors-123");
});

check("formatRef splits {slug}/{id}/{register}", () => {
    assert.strictEqual(cc.formatRef("{slug}|{register}|{id}", entity), "demo|actors|123");
});

check("formatRef prefix template", () => {
    assert.strictEqual(cc.formatRef("#{fullId}", entity), "#demo-actors-123");
});

// --- locate element under caret ------------------------------------------

check("locate finds enclosing persName and reads inner text", () => {
    const text = 'Hello <persName>Luther</persName> world';
    const caret = text.indexOf("Luther");
    const t = rt.locateElement(text, caret, targets);
    assert.ok(t, "should locate");
    assert.strictEqual(t.elementName, "persName");
    assert.strictEqual(t.register, "actors");
    assert.strictEqual(t.currentText, "Luther");
});

check("locate returns null when caret is past the close tag", () => {
    const text = '<persName>Luther</persName> and then Melanchthon';
    const caret = text.indexOf("Melanchthon");
    assert.strictEqual(rt.locateElement(text, caret, targets), null);
});

check("locate picks the nearest (innermost) start tag when nested", () => {
    const text = '<p><placeName>Wittenberg <persName>Luther</persName></placeName></p>';
    const caret = text.indexOf("Luther");
    const t = rt.locateElement(text, caret, targets);
    assert.strictEqual(t.elementName, "persName");
});

check("locate reads an existing ref attribute", () => {
    const text = '<persName ref="demo-actors-9">Luther</persName>';
    const t = rt.locateElement(text, text.indexOf("Luther"), targets);
    assert.strictEqual(t.currentRef, "demo-actors-9");
});

check("locate prefers a passed selection as prefill", () => {
    const text = '<persName>Martin Luther</persName>';
    const t = rt.locateElement(text, text.indexOf("Martin"), targets, "Luther");
    assert.strictEqual(t.currentText, "Luther");
});

// --- buildTag: attribute insert / replace with preservation ---------------

check("buildTag inserts ref preserving other attributes", () => {
    const out = rt.buildTag('<persName xml:id="p1">', "ref", "demo-actors-1");
    assert.strictEqual(out, '<persName ref="demo-actors-1" xml:id="p1">');
});

check("buildTag replaces an existing ref in place", () => {
    const out = rt.buildTag('<persName ref="old" n="2">', "ref", "demo-actors-2");
    assert.strictEqual(out, '<persName ref="demo-actors-2" n="2">');
});

check("buildTag handles a self-closing tag", () => {
    const out = rt.buildTag('<term/>', "ref", "demo-keywords-5");
    assert.strictEqual(out, '<term ref="demo-keywords-5"/>');
});

check("buildTag escapes the value", () => {
    const out = rt.buildTag("<persName>", "ref", 'a"b&c');
    assert.strictEqual(out, '<persName ref="a&quot;b&amp;c">');
});

// --- Wrap & Tag -----------------------------------------------------------

check("wrapFragment wraps the selection", () => {
    assert.strictEqual(
        rt.wrapFragment("placeName", "ref", "demo-places-3", "Wittenberg"),
        '<placeName ref="demo-places-3">Wittenberg</placeName>'
    );
});

check("wrapFragment escapes the attribute value only", () => {
    assert.strictEqual(
        rt.wrapFragment("persName", "ref", 'x"y', "A & B"),
        '<persName ref="x&quot;y">A & B</persName>'
    );
});

// --- next-occurrence search ----------------------------------------------

check("findNext locates the next verbatim occurrence at/after the anchor", () => {
    const text = "Luther ... <persName>Luther</persName> ... Luther";
    const anchor = text.indexOf("</persName>");
    const idx = rt.findNext(text, "Luther", anchor);
    assert.strictEqual(idx, text.lastIndexOf("Luther"));
});

check("findNext returns -1 when nothing follows", () => {
    assert.strictEqual(rt.findNext("only once here", "Luther", 0), -1);
});

console.log("\n" + passed + " checks passed.");
