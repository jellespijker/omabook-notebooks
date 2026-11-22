import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// What was said while a page was written (#5), a slim bar under the page
// that fades while the pen writes (#14; `faded`), its row scrolling sideways
// rather than taking more rows: recording while writing (V, or the margin's
// button, PageRail; again to stop; the window asks once whether
// Notebooks may use the microphone, and its mark says it records), the page's
// recordings to play, and while one plays, the ink as it was written then:
// the strokes written later are left out (`showInk`), and the ones written
// in the last moments glow (`glowing`, InkMoments). With the Listen tool (A)
// a tap on the ink plays what was said as it was written. The transcripts
// are beside the page (TranscriptPane), and each is asked for in the
// background once a recording stops.
//
// The recording and the player are the script's (Recordings); what they do
// comes to the view as `recording` and `playing` (`omabook.ui.set`).
ColumnLayout {
    id: box

    property string plugin: ""
    property string pageId: ""
    // {recordings: [{id, started, duration, here, recording}], moments: {stroke: {recording, at}}}
    property var line: ({recordings: [], moments: {}})
    // The page's strokes while one plays, to show part of them.
    property var all: null
    property var asked: ({})
    signal problem(string why)
    signal showInk(var strokes)
    signal replayed()
    signal transcribed()

    readonly property var told: backend.scripts.data[plugin] || ({})
    readonly property var under: told.recording && told.recording.page === pageId ? told.recording : null
    readonly property bool elsewhere: !!told.recording && !!told.recording.id && told.recording.page !== pageId
    readonly property var playing: told.playing && told.playing.page === pageId ? told.playing : null
    readonly property bool replaying: !!playing && Object.keys(line.moments).some(function (id) { return line.moments[id].recording === playing.id })
    readonly property var later: replaying ? Object.keys(line.moments).filter(function (id) {
        return line.moments[id].recording === box.playing.id && line.moments[id].at > box.playing.at }) : []
    readonly property var glowing: replaying ? Object.keys(line.moments).filter(function (id) {
        const m = line.moments[id]
        return m.recording === box.playing.id && m.at <= box.playing.at && m.at > box.playing.at - 3000 }) : []

    // The recordings that can be played here, newest last.
    readonly property var playable: line.recordings.filter(function (one) { return one.here && !one.recording })
    // While the pen writes, the bar stands back.
    property bool faded: false
    opacity: faded ? 0.3 : 1
    Behavior on opacity { NumberAnimation { duration: 200 } }

    spacing: 4
    visible: line.recordings.length > 0 || !!under || (!!told.recording && !!told.recording.problem)

    function reload() {
        if (pageId === "") return
        line = backend.scripts.call(plugin, "recordings", [pageId]) || line
    }
    function ask(fn, args, what) {
        const id = backend.scripts.request(plugin, fn, args)
        const next = Object.assign({}, asked)
        next[id] = what || fn
        asked = next
    }
    function toggle() { if (under) ask("stopRecording", []); else ask("record", [pageId]) }
    // The margin's Play: what plays paused or gone on with, else the newest from its start.
    function playOrPause() {
        if (playing) ask("playing", [playing.playing ? "pause" : "play"])
        else if (playable.length) ask("play", [playable[playable.length - 1].id, 0])
    }
    function playFrom(at) { ask("playFrom", [pageId, at.x, at.y]) }
    function time(ms) {
        const s = Math.floor((ms || 0) / 1000)
        return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2)
    }
    function transcribeAll() {
        line.recordings.forEach(function (one) { if (one.here && !one.recording) ask("transcribe", [one.id, {background: true}]) })
    }

    onPageIdChanged: { reload(); transcribeAll() }
    onUnderChanged: if (!under) { reload(); transcribeAll() }
    onReplayingChanged: {
        if (replaying) all = backend.scripts.call(plugin, "strokes", [pageId]) || {}
        else { all = null; replayed() }
    }
    onLaterChanged: {
        if (!replaying || !all) return
        const shown = Object.assign({}, all)
        later.forEach(function (id) { delete shown[id] })
        showInk(shown)
    }

    Connections {
        target: backend.scripts
        function onAnswered(id, result, error) {
            const what = box.asked[id]
            if (!what) return
            const left = Object.assign({}, box.asked)
            delete left[id]
            box.asked = left
            if (error) box.problem(error.replace(/^.*?Error: /, ""))
            if (what === "transcribe") box.transcribed()
            else box.reload()
        }
    }

    Flickable {
        Layout.fillWidth: true
        Layout.preferredHeight: bar.height
        contentWidth: bar.width
        flickableDirection: Flickable.HorizontalFlick
        // Only when it runs past the page: a Flickable takes the pen's press before a button hears it.
        interactive: contentWidth > width
        boundsBehavior: Flickable.StopAtBounds
        clip: true
        Row {
            id: bar
            spacing: 4
            Button {
                flat: true
                visible: !!box.under
                text: box.under && box.under.paused ? "Go on" : "Pause"
                onClicked: box.ask("pauseRecording", [!(box.under && box.under.paused)])
            }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                visible: !!box.under
                text: box.under ? "Recording " + box.time(box.under.elapsed) : ""
            }
            ProgressBar {
                anchors.verticalCenter: parent.verticalCenter
                visible: !!box.under
                width: 60
                value: box.under ? box.under.level : 0
                Accessible.name: "How loud it is"
            }
            Repeater {
                model: box.line.recordings
                delegate: Button {
                    required property var modelData
                    flat: true
                    visible: !modelData.recording
                    enabled: modelData.here
                    highlighted: !!box.playing && box.playing.id === modelData.id
                    text: (highlighted && box.playing.playing ? "Pause " : "Play ") + new Date(modelData.started).toLocaleTimeString(Qt.locale(), "HH:mm")
                        + ", " + box.time(modelData.duration) + (modelData.here ? "" : " (on its way)")
                    onClicked: {
                        if (!highlighted) box.ask("play", [modelData.id, 0])
                        else box.ask("playing", [box.playing.playing ? "pause" : "play"])
                    }
                }
            }
            Button { flat: true; visible: !!box.playing; text: "Stop playing"; onClicked: box.ask("playing", ["stop"]) }
        }
    }
    Slider {
        Layout.fillWidth: true
        visible: !!box.playing
        from: 0
        to: box.playing ? Math.max(1, box.playing.duration) : 1
        value: box.playing ? box.playing.at : 0
        Accessible.name: "Where it plays"
        onMoved: box.ask("playing", ["seek", value])
    }
    Label {
        Layout.fillWidth: true
        visible: !box.under && !!box.told.recording && !!box.told.recording.problem
        text: box.told.recording ? box.told.recording.problem || "" : ""
        wrapMode: Text.Wrap
        opacity: 0.8
    }
}
