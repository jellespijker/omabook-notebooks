pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Asking the AI about the notebook shown (#9): a question ("what did I
// write about entropy?"), or a summary, answered from the notebook's own
// words (the script's `askNotebook`). A notebook is private: the model
// chosen in Omabook's settings reads it when it is the person's own (Omabook
// says, #11), someone else's only once the person lets it here; never with
// the AI off.
ColumnLayout {
    id: box

    property string plugin: ""
    // The notebook shown: {id, title, hosted}.
    property var notebook: null
    property int asked: -1
    property string answer: ""
    property string problem: ""
    // Whether the AI may read it now (the script's `askReach`), asked again when the notebook changes.
    readonly property var reach: box.notebook ? (backend.scripts.call(box.plugin, "askReach", [box.notebook.id]) || null) : null
    signal changed()

    spacing: 4

    function ask(question) {
        problem = ""
        answer = ""
        asked = backend.scripts.request(plugin, "askNotebook", [notebook.id, question])
    }

    Connections {
        target: backend.scripts
        function onAnswered(id, result, error) {
            if (id !== box.asked) return
            box.asked = -1
            box.problem = (error || "").replace(/^.*?Error: /, "")
            box.answer = error || !result ? "" : result.answer + (result.cut ? "\n\n*Only the first pages were read: the notebook is long.*" : "")
        }
    }

    Switch {
        text: "Let the AI read this notebook"
        checked: !!box.notebook && box.notebook.hosted === true
        onToggled: {
            backend.scripts.call(box.plugin, "setNotebookReading", [box.notebook.id, checked])
            box.changed()
        }
        ToolTip.visible: hovered
        ToolTip.text: "Its words, handwriting included, may go to the AI chosen in Omabook's settings when that is someone else's computer."
    }
    Label {
        Layout.fillWidth: true
        visible: !!box.reach && !box.reach.available
        text: box.reach ? box.reach.message : ""
        color: theme.colors.muted
        wrapMode: Text.Wrap
    }
    RowLayout {
        Layout.fillWidth: true
        enabled: !!box.reach && box.reach.available === true && box.asked < 0
        TextField {
            id: question
            Layout.fillWidth: true
            placeholderText: "Ask about this notebook"
            Accessible.name: "A question about this notebook, for the AI"
            onAccepted: if (text.trim() !== "") box.ask(text.trim())
        }
        Button { text: "Ask"; enabled: question.text.trim() !== ""; onClicked: box.ask(question.text.trim()) }
        Button { text: "Summarise"; onClicked: box.ask("") }
    }
    Label {
        Layout.fillWidth: true
        visible: box.asked >= 0
        text: "Reading the notebook…"
        color: theme.colors.muted
    }
    TextArea {
        Layout.fillWidth: true
        visible: box.answer !== ""
        readOnly: true
        wrapMode: TextEdit.Wrap
        textFormat: TextEdit.MarkdownText
        text: box.answer
        Accessible.name: "The AI's answer"
    }
    Label {
        Layout.fillWidth: true
        visible: box.problem !== ""
        text: box.problem
        color: theme.colors.red || theme.accent
        wrapMode: Text.Wrap
    }
}
