import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// The words found in a page's ink (#6), under the page's tools: read in the
// background a moment after the pen rests, shown on request (R), corrected
// by typing in them or by saying them (its microphone, or Ctrl+M), and made a
// text block where the ink lies, beside it or in its place. Strokes chosen with the Select tool (S) are read on their
// own, and their words can become a text block the same way.
//
// The script keeps the words with the page and says where they stand
// (`recognised`): read, behind the ink, waiting for the server, or that
// there is no server that may read handwriting here.
ColumnLayout {
    id: box

    property string plugin: ""
    property string pageId: ""
    // The strokes chosen with the Select tool, by id.
    property var selection: []
    // What is said to correct it may go to a hosted speech to text service (the notebook's say).
    property bool speechHosted: false
    property var told: ({status: "empty", text: "", why: "", hand: false})
    // A selection's words, once read.
    property string picked: ""
    property bool reading: false
    // The requests asked of the script and not answered yet: id → what for.
    property var asked: ({})
    signal problem(string why)
    // Text blocks were made, and ink perhaps taken out: the page shows it.
    signal changed()

    spacing: 4

    function reload() {
        if (pageId === "") return
        told = backend.scripts.call(plugin, "recognised", [pageId]) || told
        if (!editor.activeFocus) editor.text = told.text
    }
    // A pause of the pen was written: once it has rested a while, the page is read.
    function inkChanged() { rest.restart() }
    function ask(fn, args, what) {
        const id = backend.scripts.request(plugin, fn, args)
        const next = Object.assign({}, asked)
        next[id] = what
        asked = next
        if (what === "state" || what === "picked") reading = true
    }
    function readAgain() { ask("recognise", [pageId, {again: true}], "state") }
    function readSelection() { picked = ""; ask("recognise", [pageId, {strokes: selection}], "picked") }
    function makeText(replace) {
        if (picked !== "" && selection.length)
            ask("recognisedToText", [pageId, {text: picked, strokes: selection, replace: replace}], "made")
        else
            ask("recognisedToText", [pageId, {text: editor.text, replace: replace}], "made")
    }
    function words() {
        switch (told.status) {
        case "empty": return "Nothing is written on this page yet."
        case "unread": return "Not read yet: the ink is read a moment after the pen rests."
        case "waiting": return "Waiting for the AI server: " + told.why
        case "current": return told.hand ? "Corrected by hand." : "Read by " + told.model + ", " + told.server + "."
        default: return told.why
        }
    }

    onPageIdChanged: {
        picked = ""
        reload()
        if (told.status === "unread" || told.status === "changed") rest.restart()
    }
    onSelectionChanged: picked = ""

    Timer {
        id: rest
        interval: 2500
        onTriggered: if (box.pageId !== "") box.ask("recognise", [box.pageId, {background: true}], "state")
    }

    Connections {
        target: backend.scripts
        function onAnswered(id, result, error) {
            const what = box.asked[id]
            if (!what) return
            const left = Object.assign({}, box.asked)
            delete left[id]
            box.asked = left
            box.reading = Object.keys(left).some(function (one) { return left[one] === "state" || left[one] === "picked" })
            if (error) {
                box.problem(error.replace(/^.*?Error: /, ""))
                box.reload()
            } else if (what === "picked") {
                box.picked = result.text
            } else if (what === "made") {
                box.picked = ""
                box.changed()
                box.reload()
            } else if (result && result.status !== undefined) {
                box.told = result
                if (!editor.activeFocus) editor.text = result.text
            }
        }
    }

    Label {
        Layout.fillWidth: true
        text: box.reading && box.told.status !== "waiting" ? "Reading the handwriting…" : box.words()
        wrapMode: Text.Wrap
        opacity: 0.8
    }

    RowLayout {
        Layout.fillWidth: true
        visible: box.told.status !== "empty"
        ScrollView {
            Layout.fillWidth: true
            Layout.preferredHeight: 96
            TextArea {
                id: editor
                placeholderText: "The words of this page's handwriting"
                wrapMode: TextEdit.Wrap
                Accessible.name: "Recognised text"
                // Typed in and left: the person's own words, kept for the ink as it is.
                onEditingFinished: if (text !== box.told.text) box.ask("correctRecognised", [box.pageId, text], "state")
                Keys.onEscapePressed: box.forceActiveFocus()
            }
        }
        // Corrected by saying it (#13): what is said goes in at the cursor, kept once the field is left.
        Dictate {
            objectName: "recognisedDictate"
            Layout.alignment: Qt.AlignTop
            target: editor
            inUse: box.visible && box.told.status !== "empty"
            hosted: box.speechHosted
        }
    }

    Flow {
        Layout.fillWidth: true
        spacing: 4
        Button {
            flat: true
            text: "Recognise again"
            visible: box.told.status !== "empty" && box.told.status !== "unavailable"
            onClicked: box.readAgain()
        }
        Button {
            flat: true
            text: "Make a text block"
            enabled: editor.text.trim() !== "" && box.picked === ""
            onClicked: box.makeText(false)
        }
        Button {
            flat: true
            text: "Text block in place of the ink"
            enabled: editor.text.trim() !== "" && box.picked === ""
            onClicked: box.makeText(true)
        }
        Button {
            flat: true
            visible: box.selection.length > 0
            text: "Recognise the selection (" + box.selection.length + (box.selection.length === 1 ? " stroke)" : " strokes)")
            onClicked: box.readSelection()
        }
    }

    ColumnLayout {
        Layout.fillWidth: true
        visible: box.picked !== ""
        Label { Layout.fillWidth: true; text: "The selection reads: " + box.picked; wrapMode: Text.Wrap }
        Flow {
            Layout.fillWidth: true
            spacing: 4
            Button { flat: true; text: "Make a text block of it"; onClicked: box.makeText(false) }
            Button { flat: true; text: "In place of the selection"; onClicked: box.makeText(true) }
        }
    }
}
