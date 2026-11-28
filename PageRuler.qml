pragma ComponentBehavior: Bound
import QtQuick

// A ruler lying on a page (#10): see-through, marked in millimetres along both
// edges. The mouse, a finger or the pen drags it, and turns it by the knob at
// its right end; two fingers on it turn it too, as does the wheel. Its × puts
// it away. It takes what comes down on it, so nothing is written under it,
// while a line drawn beside an edge is laid on the edge (PageShapes).
//
// It lies in its parent, the page's sheet, where `at` (its middle) and its
// length and width are millimetres, `unit` pixels to one.
Item {
    id: ruler

    property real unit: 1
    property point at: Qt.point(parent ? parent.width / unit / 2 : 0, parent ? parent.height / unit / 2 : 0)
    property real angle: 0
    // Where its middle is shown: on the page, one smaller than it was put on too.
    readonly property point middle: parent ? Qt.point(Math.min(at.x, parent.width / unit), Math.min(at.y, parent.height / unit)) : at
    // Nine tenths of the page, 20 cm at the most; wide enough for a fingertip.
    readonly property real length: parent ? Math.min(200, parent.width / unit * 0.9) : 100
    readonly property real breadth: Math.max(18, 48 / unit)
    readonly property bool holding: held.active || knobHeld.active
    signal putAway()

    function measures() { return {x: middle.x, y: middle.y, angle: angle, length: length, width: breadth} }
    // Moved by millimetres, its middle kept on the page.
    function move(dx, dy) { moveTo(middle.x + dx, middle.y + dy) }
    function moveTo(x, y) {
        at = Qt.point(Math.max(0, Math.min(parent.width / unit, x)), Math.max(0, Math.min(parent.height / unit, y)))
    }
    function turn(by) { angle = tidy(angle + by) }
    // An angle from -180 to 180.
    function tidy(degrees) { return ((degrees + 180) % 360 + 360) % 360 - 180 }
    // Turned by hand it catches at every 15 degrees.
    function caught(degrees) {
        const near = Math.round(degrees / 15) * 15
        return tidy(Math.abs(degrees - near) < 2 ? near : Math.round(degrees))
    }

    x: middle.x * unit - width / 2
    y: middle.y * unit - height / 2
    width: length * unit
    height: breadth * unit
    rotation: angle
    Accessible.role: Accessible.Grip
    Accessible.name: "Ruler, turned " + Math.round(angle) + " degrees (arrows move it, Alt and the arrows turn it, U puts it away)"

    Rectangle {
        anchors.fill: parent
        color: "#59a9c4dd"
        border.width: 1
        border.color: "#5a6b82"
    }
    // A mark at every millimetre, longer at five and at ten, along both edges.
    Repeater {
        model: 2 * (Math.floor(ruler.length) + 1)
        delegate: Rectangle {
            required property int index
            readonly property int millimetre: Math.floor(index / 2)
            readonly property real long: (millimetre % 10 === 0 ? 3.5 : millimetre % 5 === 0 ? 2.5 : 1.5) * ruler.unit
            visible: ruler.unit >= 2.5 || millimetre % 5 === 0
            x: Math.min(ruler.width - width, millimetre * ruler.unit)
            y: index % 2 ? ruler.height - long : 0
            width: 1
            height: long
            color: "#33415a"
        }
    }
    Repeater {
        model: Math.floor(ruler.length / 10)
        delegate: Text {
            required property int index
            x: (index + 1) * 10 * ruler.unit - width / 2
            y: 4 * ruler.unit
            text: index + 1
            font.pixelSize: Math.max(7, 2.4 * ruler.unit)
            color: "#33415a"
        }
    }
    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 4 * ruler.unit
        // How it is turned, anticlockwise from level, as it is read.
        text: Math.round(-ruler.angle) + "°"
        font.pixelSize: Math.max(9, 3.2 * ruler.unit)
        color: "#1d1d1f"
    }

    // Every finger put on it stays here too, a second one included, so none
    // writes under it; the handlers above hear them first.
    MultiPointTouchArea { anchors.fill: parent; mouseEnabled: false }
    // The body: dragged to move it.
    Item {
        id: body
        anchors.fill: parent
        property point from: Qt.point(0, 0)
        // A press stays here: nothing is written under the ruler.
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds }
        PointHandler { id: held }
        DragHandler {
            target: null
            grabPermissions: PointerHandler.CanTakeOverFromAnything
            onActiveChanged: if (active) body.from = ruler.middle
            onCentroidChanged: {
                if (!active) return
                const now = ruler.parent.mapFromItem(null, centroid.scenePosition)
                const began = ruler.parent.mapFromItem(null, centroid.scenePressPosition)
                ruler.moveTo(body.from.x + (now.x - began.x) / ruler.unit, body.from.y + (now.y - began.y) / ruler.unit)
            }
        }
        PinchHandler {
            target: null
            property real from: 0
            grabPermissions: PointerHandler.CanTakeOverFromAnything
            onActiveChanged: if (active) from = ruler.angle
            onActiveRotationChanged: if (active) ruler.angle = ruler.caught(from + activeRotation)
        }
        WheelHandler {
            acceptedModifiers: Qt.NoModifier
            onWheel: (event) => ruler.turn(event.angleDelta.y > 0 ? -1 : 1)
        }
        HoverHandler { cursorShape: Qt.SizeAllCursor }
    }

    // The × that puts it away, at its left end.
    Rectangle {
        anchors.verticalCenter: parent.verticalCenter
        x: 4
        width: 44
        height: 44
        radius: 22
        color: "#fdfcf8"
        border.color: "#5a6b82"
        Accessible.role: Accessible.Button
        Accessible.name: "Put the ruler away (U)"
        Text { anchors.centerIn: parent; text: "×"; font.pixelSize: 22; color: "#1d1d1f" }
        HoverHandler { cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onTapped: ruler.putAway() }
    }
    // The knob it is turned by, at its right end.
    Rectangle {
        anchors.verticalCenter: parent.verticalCenter
        anchors.right: parent.right
        anchors.rightMargin: 4
        width: 44
        height: 44
        radius: 22
        color: "#fdfcf8"
        border.color: "#5a6b82"
        Accessible.role: Accessible.Grip
        Accessible.name: "Turn the ruler (Alt and the left and right arrows)"
        Text { anchors.centerIn: parent; text: "↻"; font.pixelSize: 22; color: "#1d1d1f" }
        HoverHandler { cursorShape: Qt.PointingHandCursor }
        TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds }
        PointHandler { id: knobHeld }
        DragHandler {
            target: null
            grabPermissions: PointerHandler.CanTakeOverFromAnything
            onCentroidChanged: {
                if (!active) return
                const now = ruler.parent.mapFromItem(null, centroid.scenePosition)
                ruler.angle = ruler.caught(Math.atan2(now.y - ruler.middle.y * ruler.unit, now.x - ruler.middle.x * ruler.unit) * 180 / Math.PI)
            }
        }
    }
}
