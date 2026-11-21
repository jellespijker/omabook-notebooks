pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Asking the AI about the notebook shown (#9): a question ("what did I
// write about entropy?"), or a summary, answered from the notebook's own
// words (the script's `askNotebook`). A notebook is private: the AI reads it
// only once the person lets it here, and then by the model chosen in
// Omabook's settings; never with the AI off.
ColumnLayout {
    id: box

    property string plugin: ""
    // The notebook shown: {id, title, hosted}.
    property var notebook: null
    property int asked: -1
    property string answer: ""
    property string problem: ""
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
        ToolTip.text: "Its words, handwriting included, go to the AI chosen in Omabook's settings, which may be a hosted one."
    }
    RowLayout {
        Layout.fillWidth: true
        enabled: !!box.notebook && box.notebook.hosted === true && box.asked < 0
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
