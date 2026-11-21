pragma ComponentBehavior: Bound
import QtQuick

// Over a page's ink while a recording is about (#5): the strokes written in
// the last moments of what plays glow, and with the Listen tool a tap on the
// ink plays what was said as it was written. Where the strokes lie comes
// from the script once, in millimetres; `unit` is the pixels to one.
Item {
    id: moments

    property string plugin: ""
    property string pageId: ""
    property real unit: 1
    property bool listening: false
    // The strokes that glow now, by id (PageRecordings).
    property var glowing: []
    property var lying: ({})
    signal tapped(var at)

    onGlowingChanged: if (glowing.length && !lying[glowing[0]]) lying = backend.scripts.call(plugin, "strokeBounds", [pageId]) || {}
    onPageIdChanged: lying = ({})

    Repeater {
        model: moments.glowing
        delegate: Rectangle {
            required property string modelData
            readonly property var box: moments.lying[modelData] || ({x: 0, y: 0, width: 0, height: 0})
            x: (box.x - 1) * moments.unit
            y: (box.y - 1) * moments.unit
            width: (box.width + 2) * moments.unit
            height: (box.height + 2) * moments.unit
            radius: 4
            color: Qt.rgba(theme.accent.r, theme.accent.g, theme.accent.b, 0.18)
            border.color: theme.accent
            border.width: 1
        }
    }

    TapHandler {
        enabled: moments.listening
        onTapped: (point) => moments.tapped({x: point.position.x / moments.unit, y: point.position.y / moments.unit})
    }
}
