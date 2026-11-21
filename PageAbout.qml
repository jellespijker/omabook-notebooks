pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// What the page is about in the knowledge graph (#7), under the page's
// tools on request (K): the things the person said it is about, each taken
// back with a tap; the things of the graph its words name (typed, written
// or said), to say yes or no to; and a field to say by hand what else it is
// about, a thing the graph knows or a new topic. Nothing goes into the graph
// unasked (Mentions). A loose note is in no book, so it says what to do.
ColumnLayout {
    id: box

    property string plugin: ""
    property string pageId: ""
    property bool loose: false
    // [{id, kind, name, made}], [{node, kind, name, summary}] and what the field finds.
    property var said: []
    property var offered: []
    property var found: []
    property var asked: ({})
    signal problem(string why)

    spacing: 4

    function reload() {
        if (pageId === "" || !visible) return
        said = backend.scripts.call(plugin, "mentions", [pageId]) || []
        offered = loose ? [] : (backend.scripts.call(plugin, "suggestMentions", [pageId]) || [])
    }
    function ask(fn, args) {
        const id = backend.scripts.request(plugin, fn, args)
        const next = Object.assign({}, asked)
        next[id] = true
        asked = next
    }
    function about(what) {
        ask("mention", [pageId, what])
        lookup.text = ""
    }
    onPageIdChanged: reload()
    onVisibleChanged: reload()

    Connections {
        target: backend.scripts
        function onAnswered(id, result, error) {
            if (!box.asked[id]) return
            const left = Object.assign({}, box.asked)
            delete left[id]
            box.asked = left
            if (error) box.problem(error.replace(/^.*?Error: /, ""))
            box.reload()
        }
    }

    Label {
        Layout.fillWidth: true
        visible: box.loose
        text: "A loose note isn't in the library: file it into a notebook to say what it is about in the knowledge graph."
        wrapMode: Text.Wrap
        opacity: 0.8
    }
    Flow {
        Layout.fillWidth: true
        visible: !box.loose
        spacing: 4
        Label { text: box.said.length > 0 ? "About:" : "Not tied to anything in the knowledge graph yet."; opacity: 0.8 }
        Repeater {
            model: box.said
            delegate: Button {
                required property var modelData
                flat: true
                text: modelData.name + "  ×"
                Accessible.name: "This page is about " + modelData.name + ". Take it back"
                onClicked: box.ask("forgetMention", [modelData.id])
            }
        }
    }
    Repeater {
        model: box.offered
        delegate: RowLayout {
            id: offer
            required property var modelData
            Layout.fillWidth: true
            Label {
                Layout.fillWidth: true
                text: "Named here: " + offer.modelData.name + " (" + offer.modelData.kind + ")"
                    + (offer.modelData.summary ? ", " + offer.modelData.summary : "")
                elide: Text.ElideRight
            }
            Button { flat: true; text: "About it"; onClicked: box.about({node: offer.modelData.node}) }
            Button { flat: true; text: "Not about it"; onClicked: box.ask("dismissMention", [box.pageId, {kind: offer.modelData.kind, name: offer.modelData.name}]) }
        }
    }
    RowLayout {
        Layout.fillWidth: true
        visible: !box.loose
        TextField {
            id: lookup
            Layout.fillWidth: true
            placeholderText: "About something else…"
            Accessible.name: "Say what this page is about: find it in the knowledge graph"
            onTextChanged: box.found = text.trim() === "" ? [] : (backend.scripts.call(box.plugin, "findThings", [text]) || [])
            onAccepted: if (text.trim() !== "") box.about(box.found.length > 0 ? {node: box.found[0].node} : {kind: "topic", name: text})
            Keys.onEscapePressed: text = ""
        }
        Button {
            flat: true
            enabled: lookup.text.trim() !== ""
            text: "New topic"
            onClicked: box.about({kind: "topic", name: lookup.text})
        }
    }
    Flow {
        Layout.fillWidth: true
        visible: box.found.length > 0
        spacing: 4
        Repeater {
            model: box.found
            delegate: Button {
                required property var modelData
                flat: true
                text: modelData.name + " (" + modelData.kind + ")"
                onClicked: box.about({node: modelData.node})
            }
        }
    }
}
