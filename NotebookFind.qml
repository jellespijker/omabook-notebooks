pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Finding words in the notebooks (#7), over the list of them: what was
// typed, read from the ink and said while writing (the script's `find`).
// Each hit says where it is, and choosing one opens its page; one in a
// recording plays from the moment the words were said, or from the start of
// their sentence where the transcript has no moment for each word (voxtype
// gives none), which the hit says. Escape, or clearing
// the words, shows the notebooks again.
ColumnLayout {
    id: box

    property string plugin: ""
    property var hits: []
    readonly property bool active: field.text.trim() !== ""
    signal go(var hit)

    spacing: 4

    function kindOf(hit) {
        if (hit.kind !== "transcript")
            return hit.kind === "typed" ? "typed" : "handwriting"
        return hit.timed === false ? "said in the sentence from " + time(hit.at) + ": this transcript has no moment for each word"
                                   : "said at " + time(hit.at)
    }
    function time(ms) {
        const s = Math.floor((ms || 0) / 1000)
        return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2)
    }
    function where(hit) {
        return hit.title + "  ·  " + (hit.loose ? "note " : "page ") + hit.number + "  ·  " + kindOf(hit)
    }

    TextField {
        id: field
        Layout.fillWidth: true
        placeholderText: "Find in notebooks"
        Accessible.name: "Find words in the notebooks: typed, handwritten or said"
        onTextChanged: box.hits = box.active ? (backend.scripts.call(box.plugin, "find", [text]) || []) : []
        onAccepted: if (box.hits.length > 0) box.go(box.hits[0])
        Keys.onEscapePressed: text = ""
    }
    Label {
        Layout.fillWidth: true
        visible: box.active && box.hits.length === 0
        text: "No page holds these words."
        opacity: 0.7
    }
    ListView {
        Layout.fillWidth: true
        Layout.fillHeight: true
        visible: box.active
        clip: true
        model: box.hits
        delegate: ItemDelegate {
            id: hit
            required property var modelData
            width: ListView.view.width
            contentItem: Column {
                spacing: 2
                Label { text: box.where(hit.modelData); font.pixelSize: 11; opacity: 0.7; width: parent.width; elide: Text.ElideRight }
                Label { text: hit.modelData.text; width: parent.width; wrapMode: Text.Wrap; maximumLineCount: 2; elide: Text.ElideRight }
            }
            Accessible.name: box.where(hit.modelData) + ": " + hit.modelData.text
            onClicked: box.go(hit.modelData)
        }
    }
}
