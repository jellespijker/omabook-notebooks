pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// What was said while the page was written (#5), beside it: each
// recording's transcript, in its segments, and where it stands (heard,
// being listened to, waiting for the server, or that there is no server of
// one's own that transcribes speech, in Omabook's words). A tap on a segment
// plays from it, and while a recording plays the segment it is at is marked.
// A transcript without each word's moment (voxtype's) says that a word plays
// from the start of its sentence. W shows or hides it.
Pane {
    id: pane

    property string plugin: ""
    property string pageId: ""
    // What plays, as PageRecordings has it: {id, at, ...}, or null.
    property var playing: null
    property var said: []
    signal play(string id, real at)

    padding: 8

    function reload() {
        said = pageId === "" ? [] : (backend.scripts.call(plugin, "transcripts", [pageId]) || [])
    }
    function words(one) {
        switch (one.status) {
        case "current": return "Heard by " + one.model + ", " + one.server + "."
            + (one.timed === false ? " It gives no moment for each word, so a word found plays from the start of its sentence." : "")
        case "untranscribed": return "Not transcribed yet."
        case "transcribing": return "Listening to the recording…"
        case "waiting": return "Waiting for the server: " + one.why
        default: return one.why
        }
    }
    onPageIdChanged: reload()
    onVisibleChanged: if (visible) reload()

    ScrollView {
        anchors.fill: parent
        clip: true
        ColumnLayout {
            width: pane.availableWidth
            spacing: 8
            Label {
                Layout.fillWidth: true
                visible: pane.said.length === 0
                text: "Nothing was recorded on this page yet. Record (V) while you write, and what was said comes here."
                wrapMode: Text.Wrap
                opacity: 0.8
            }
            Repeater {
                model: pane.said
                delegate: ColumnLayout {
                    id: one
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: 2
                    Label {
                        Layout.fillWidth: true
                        text: pane.words(one.modelData)
                        wrapMode: Text.Wrap
                        opacity: 0.7
                        font.pixelSize: 12
                    }
                    Repeater {
                        model: one.modelData.segments || []
                        delegate: Label {
                            id: segment
                            required property var modelData
                            readonly property bool now: !!pane.playing && pane.playing.id === one.modelData.id
                                && pane.playing.at >= modelData.start
                                && (modelData.end <= modelData.start || pane.playing.at < modelData.end + 500)
                            Layout.fillWidth: true
                            text: modelData.text
                            wrapMode: Text.Wrap
                            color: now ? theme.accent : theme.foreground
                            font.bold: now
                            Accessible.role: Accessible.Button
                            Accessible.name: modelData.text
                            HoverHandler { cursorShape: Qt.PointingHandCursor }
                            TapHandler { onTapped: pane.play(one.modelData.id, segment.modelData.start) }
                        }
                    }
                }
            }
        }
    }
}
