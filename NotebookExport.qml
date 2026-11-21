pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Exporting the notebook shown (#9): as a PDF (ink, paper, typed text and
// pictures, as the pages look) or as Markdown (its words, pictures as files
// beside it, place references as links), the whole notebook or the page
// open, by a name (the notebook's title when none is given). Omabook can't
// yet let a plugin ask where to save, so it is saved in the plugin's own
// folder, and the folder opens from here.
ColumnLayout {
    id: box

    property string plugin: ""
    // The notebook shown ({id, title}), and the page open in it, "" for none.
    property var notebook: null
    property string page: ""
    property int asked: -1
    property var saved: null
    property string problem: ""

    spacing: 4

    function start() {
        problem = ""
        saved = null
        const options = {format: pdf.checked ? "pdf" : "markdown", name: name.text.trim()}
        if (onlyPage.checked && page !== "")
            options.pages = [page]
        asked = backend.scripts.request(plugin, "exportNotebook", [notebook ? notebook.id : "", options])
    }

    Connections {
        target: backend.scripts
        function onAnswered(id, result, error) {
            if (id !== box.asked) return
            box.asked = -1
            box.problem = (error || "").replace(/^.*?Error: /, "")
            box.saved = error ? null : result
        }
    }

    RowLayout {
        Layout.fillWidth: true
        RadioButton { id: pdf; text: "PDF"; checked: true; Accessible.name: "Export as a PDF: the pages as they look" }
        RadioButton { text: "Markdown"; Accessible.name: "Export as Markdown: the words, with the pictures beside them" }
        CheckBox { id: onlyPage; visible: box.page !== ""; text: "This page only" }
        Item { Layout.fillWidth: true }
    }
    RowLayout {
        Layout.fillWidth: true
        TextField {
            id: name
            Layout.fillWidth: true
            placeholderText: box.notebook ? box.notebook.title : "Name"
            Accessible.name: "The name of the exported file"
            onAccepted: if (box.asked < 0) box.start()
        }
        Button {
            text: box.asked >= 0 ? "Exporting…" : "Export"
            enabled: box.asked < 0 && box.notebook !== null
            onClicked: box.start()
        }
    }
    Label {
        Layout.fillWidth: true
        visible: box.saved !== null
        text: box.saved ? "Saved as " + box.saved.path + (box.saved.missed ? " (" + box.saved.missed + " pictures not shown)" : "") : ""
        wrapMode: Text.Wrap
    }
    Button {
        visible: box.saved !== null
        flat: true
        text: "Open the folder"
        onClicked: Qt.openUrlExternally("file://" + box.saved.folder)
    }
    Label {
        Layout.fillWidth: true
        visible: box.problem !== ""
        text: box.problem
        color: theme.colors.red || theme.accent
        wrapMode: Text.Wrap
    }
    Label {
        Layout.fillWidth: true
        text: "Saved in Notebooks' own folder, which syncs to your other computers; copy it from there to keep it elsewhere."
        color: theme.colors.muted
        font.pixelSize: 11
        wrapMode: Text.Wrap
    }
}
