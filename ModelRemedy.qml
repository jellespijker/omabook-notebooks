import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Omabook's offer where handwriting or a recording couldn't be read for want
// of a model on its server (#16, jellespijker/omabook#172): a model already
// there that can do it, or a small one to download onto it, chosen with one
// press, by mouse, finger or pen, or Enter or Space once it has the keyboard
// (Tab). The script does it (`mend`: mendRecognition or mendTranscription,
// which read the page or the recording again), and says how far a download
// is (`mending`). Without an offer (an older Omabook, or nothing to be done)
// it isn't there, and the reason above it is said as before.
ColumnLayout {
    id: offer

    property string plugin: ""
    // "handwriting" or "speech-to-text".
    property string capability: "handwriting"
    // As the script says it: {action ("use" or "download"), model, size, server}, or null.
    property var remedy: null
    // The script's function that does it, and its arguments.
    property string mend: ""
    property var mendArgs: []
    // How far a download is, 0 to 1; -1 while nothing is under way.
    property real progress: -1
    property int asked: -1
    // Done: what was read again with the model, as the script answers it.
    signal mended(var result)
    signal problem(string why)

    readonly property string does: capability === "handwriting" ? "reads handwriting" : "transcribes speech"
    readonly property bool downloading: asked >= 0

    function sizeOf(bytes) {
        if (!(bytes > 0)) return ""
        if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB"
        return Math.max(1, Math.round(bytes / 1e6)) + " MB"
    }
    function words() {
        if (!remedy) return ""
        if (downloading)
            return remedy.action === "download"
                ? "Downloading " + remedy.model + " onto " + remedy.server + "… " + Math.round(Math.max(progress, 0) * 100) + "%"
                : "Choosing " + remedy.model + "…"
        if (remedy.action === "use")
            return remedy.server + " has " + remedy.model + ", which " + does + "."
        const size = sizeOf(remedy.size)
        return "Omabook can download " + remedy.model + (size ? " (" + size + ")" : "") + ", which " + does
            + ", onto " + remedy.server + "."
    }
    function start() {
        if (downloading || !remedy) return
        progress = 0
        asked = backend.scripts.request(plugin, mend, mendArgs)
        poll.start()
    }

    visible: !!remedy || downloading
    spacing: 2

    Timer {
        id: poll
        interval: 400
        repeat: true
        onTriggered: offer.progress = backend.scripts.call(offer.plugin, "mending", [offer.capability])
    }

    Connections {
        target: backend.scripts
        function onAnswered(id, result, error) {
            if (id !== offer.asked) return
            offer.asked = -1
            offer.progress = -1
            poll.stop()
            if (error) offer.problem(error.replace(/^.*?Error: /, ""))
            else offer.mended(result)
        }
    }

    Label {
        Layout.fillWidth: true
        text: offer.words()
        wrapMode: Text.Wrap
    }
    ProgressBar {
        Layout.fillWidth: true
        visible: offer.downloading && offer.remedy && offer.remedy.action === "download"
        value: Math.max(offer.progress, 0)
    }
    Button {
        objectName: "modelRemedy"
        visible: !offer.downloading
        focusPolicy: Qt.StrongFocus
        text: !offer.remedy ? "" : offer.remedy.action === "use" ? "Use " + offer.remedy.model : "Download " + offer.remedy.model + " and use it"
        Accessible.name: text
        Keys.onReturnPressed: clicked()
        Keys.onEnterPressed: clicked()
        onClicked: offer.start()
    }
}
