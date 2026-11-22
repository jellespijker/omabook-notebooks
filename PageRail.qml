pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Shapes

// The slim column of small buttons in the page's margin (#14), so the page
// has the view: the way back to the pages, the handle that shows every tool
// (PageTools, \), the pens, the eraser and the colours, undo and redo, and
// recording, playing and what was said. Each is a fingertip (44 px) for a
// finger and the pen, says its key in a tooltip and its name to a screen
// reader; the keys themselves are the page's (InkPage). It scrolls where the
// window is too short for all of it.
Flickable {
    id: rail

    required property InkPage page
    // What the way back says of where the page is: "Page 2 of 5 · Physics".
    property string where: ""
    signal back()

    implicitWidth: 48
    contentHeight: column.height
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    flickableDirection: Flickable.VerticalFlick
    ScrollIndicator.vertical: ScrollIndicator {}

    // Each drawing, in a square of 24.
    readonly property var drawings: ({
        back: "M15 5 L8 12 L15 19",
        tools: "M4 7 H20 M4 12 H20 M4 17 H20 M9 5 V9 M15 10 V14 M7 15 V19",
        close: "M6 6 L18 18 M18 6 L6 18",
        pen: "M4 20 L5 15 L16 4 L20 8 L9 19 Z M14 6 L18 10",
        highlighter: "M6 20 H14 M8 17 V13 L15 6 L19 10 L12 17 Z",
        eraser: "M8 20 L4 16 L14 6 L20 12 L12 20 Z M9 11 L15 17 M12 20 H20",
        undo: "M9 6 L5 10 L9 14 M5 10 H15 A4.5 4.5 0 0 1 15 19 H11",
        redo: "M15 6 L19 10 L15 14 M19 10 H9 A4.5 4.5 0 0 0 9 19 H13",
        record: "M12 6.5 A5.5 5.5 0 1 0 12.01 6.5 Z",
        stop: "M7 7 H17 V17 H7 Z",
        play: "M8 5 L19 12 L8 19 Z",
        pause: "M8 5 V19 M16 5 V19",
        said: "M4 5 H20 V16 H11 L7 20 V16 H4 Z M8 9 H16 M8 12 H13"
    })

    component Sign: Shape {
        id: sign
        property string drawing: ""
        property color ink: theme.foreground
        property color filled: "transparent"
        property bool turned: false
        width: 24
        height: 24
        preferredRendererType: Shape.CurveRenderer
        transform: Scale { origin.x: 12; xScale: sign.turned ? -1 : 1 }
        ShapePath {
            strokeColor: sign.ink
            strokeWidth: 1.8
            fillColor: sign.filled
            capStyle: ShapePath.RoundCap
            joinStyle: ShapePath.RoundJoin
            PathSvg { path: rail.drawings[sign.drawing] || "" }
        }
    }

    component RailButton: AbstractButton {
        id: button
        property string drawing: ""
        property string tip: ""
        property string key: ""
        property bool lit: false
        property color filled: "transparent"
        // A drawing that points the way of reading turns with it.
        property bool turns: false
        implicitWidth: 44
        implicitHeight: 44
        focusPolicy: Qt.NoFocus
        Accessible.role: Accessible.Button
        Accessible.name: tip
        Accessible.description: key === "" ? "" : "Key: " + key
        ToolTip.visible: hovered
        ToolTip.delay: 500
        ToolTip.text: key === "" ? tip : tip + " (" + key + ")"
        // A pen's press comes as a tablet's, which the column, a Flickable, takes before a button hears it.
        TapHandler {
            acceptedDevices: PointerDevice.Stylus
            gesturePolicy: TapHandler.WithinBounds
            onTapped: if (button.enabled) button.clicked()
        }
        background: Rectangle {
            radius: theme.radius
            color: button.lit ? Qt.alpha(theme.accent, 0.22) : button.down || button.hovered ? theme.colors.selection : "transparent"
            border.width: button.lit ? 1 : 0
            border.color: theme.accent
        }
        contentItem: Item {
            Sign {
                anchors.centerIn: parent
                drawing: button.drawing
                ink: button.enabled ? theme.foreground : theme.colors.muted
                filled: button.filled
                turned: button.turns && button.mirrored
            }
        }
    }

    component Gap: Rectangle {
        width: 28
        height: 1
        anchors.horizontalCenter: parent ? parent.horizontalCenter : undefined
        color: theme.colors.selection
    }

    Column {
        id: column
        width: rail.width
        spacing: 2
        topPadding: 2
        bottomPadding: 2

        RailButton {
            objectName: "railBack"
            anchors.horizontalCenter: parent.horizontalCenter
            drawing: "back"
            turns: true
            tip: "Back to the pages" + (rail.where === "" ? "" : ", from " + rail.where)
            key: "Backspace"
            onClicked: rail.back()
        }
        RailButton {
            objectName: "railTools"
            anchors.horizontalCenter: parent.horizontalCenter
            drawing: rail.page.allTools ? "close" : "tools"
            lit: rail.page.allTools
            tip: rail.page.allTools ? "Hide the tools" : "Every tool"
            key: "\\"
            onClicked: rail.page.allTools = !rail.page.allTools
        }
        Gap {}
        Repeater {
            model: rail.page.tools ? rail.page.tools.pens : []
            delegate: RailButton {
                required property var modelData
                objectName: "rail-" + modelData.id
                anchors.horizontalCenter: parent ? parent.horizontalCenter : undefined
                drawing: modelData.id === "highlighter" ? "highlighter" : "pen"
                tip: modelData.title
                key: modelData.key
                lit: rail.page.tool === modelData.id
                onClicked: rail.page.choose(modelData.id)
            }
        }
        RailButton {
            objectName: "rail-eraser"
            anchors.horizontalCenter: parent.horizontalCenter
            drawing: "eraser"
            tip: rail.page.tool === "eraser" ? "Eraser, again for whole strokes or parts" : "Eraser"
            key: "E"
            lit: rail.page.tool === "eraser"
            onClicked: rail.page.choose("eraser")
        }
        // The colours of the pen in hand, the one chosen ringed.
        Repeater {
            model: rail.page.colours
            delegate: AbstractButton {
                id: swatch
                required property var modelData
                required property int index
                readonly property bool chosen: rail.page.tool !== "eraser" && !rail.page.resting
                                               && rail.page.colourAt[rail.page.pen.id] === index
                objectName: "railColour" + index
                anchors.horizontalCenter: parent ? parent.horizontalCenter : undefined
                implicitWidth: 44
                implicitHeight: 44
                focusPolicy: Qt.NoFocus
                Accessible.role: Accessible.Button
                Accessible.name: modelData.title
                Accessible.description: "Key: " + (index + 1)
                ToolTip.visible: hovered
                ToolTip.delay: 500
                ToolTip.text: modelData.title + " (" + (index + 1) + ")"
                TapHandler {
                    acceptedDevices: PointerDevice.Stylus
                    gesturePolicy: TapHandler.WithinBounds
                    onTapped: swatch.clicked()
                }
                background: Rectangle {
                    radius: theme.radius
                    color: swatch.down || swatch.hovered ? theme.colors.selection : "transparent"
                }
                contentItem: Item {
                    Rectangle {
                        anchors.centerIn: parent
                        width: 22
                        height: 22
                        radius: 11
                        color: swatch.modelData.value
                        border.width: swatch.chosen ? 3 : 1
                        border.color: swatch.chosen ? theme.foreground : theme.colors.selection
                    }
                }
                onClicked: rail.page.chooseColour(index)
            }
        }
        Gap {}
        RailButton {
            objectName: "railUndo"
            anchors.horizontalCenter: parent.horizontalCenter
            drawing: "undo"
            turns: true
            tip: "Undo"
            key: "Ctrl+Z"
            enabled: rail.page.ink.canUndo
            onClicked: rail.page.ink.undo()
        }
        RailButton {
            objectName: "railRedo"
            anchors.horizontalCenter: parent.horizontalCenter
            drawing: "redo"
            turns: true
            tip: "Redo"
            key: "Ctrl+Shift+Z"
            enabled: rail.page.ink.canRedo
            onClicked: rail.page.ink.redo()
        }
        Gap {}
        RailButton {
            objectName: "railRecord"
            anchors.horizontalCenter: parent.horizontalCenter
            readonly property bool on: !!rail.page.recordings.under
            drawing: on ? "stop" : "record"
            filled: theme.colors.red || "#c0392b"
            lit: on
            tip: on ? "Stop recording" : "Record what is said while writing"
            key: "V"
            enabled: !rail.page.recordings.elsewhere
            onClicked: rail.page.recordings.toggle()
        }
        RailButton {
            objectName: "railPlay"
            anchors.horizontalCenter: parent.horizontalCenter
            readonly property bool on: !!rail.page.recordings.playing && rail.page.recordings.playing.playing
            visible: rail.page.recordings.playable.length > 0
            drawing: on ? "pause" : "play"
            filled: on ? "transparent" : theme.foreground
            lit: !!rail.page.recordings.playing
            tip: on ? "Pause what was said" : "Play what was said"
            onClicked: rail.page.recordings.playOrPause()
        }
        RailButton {
            objectName: "railSaid"
            anchors.horizontalCenter: parent.horizontalCenter
            drawing: "said"
            lit: rail.page.showSaid
            tip: "What was said"
            key: "W"
            onClicked: rail.page.showSaid = !rail.page.showSaid
        }
    }
}
