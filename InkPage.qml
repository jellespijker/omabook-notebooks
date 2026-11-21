import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Omabook

// One page, written on (#3): its paper, Omabook's ink surface over it (#78),
// and the tools above. The pen writes wherever it is, its other end erases,
// and a palm resting on the screen is ignored while the pen is near; a finger
// writes until a pen has been seen, then scrolls the page (or as the finger
// button says), and the mouse writes too. Ctrl and the wheel, a pinch, or
// Ctrl+= and Ctrl+- zoom.
//
// The ink is the script's: the page's strokes come from it (`strokes`) and
// each pause of the pen goes to it as an ink batch (`ink`), one write to the
// change log. Points are millimetres of the page, `inkScale` the pixels to
// one at this zoom. Leaving the page, its notebook's file is written once.
//
// Text blocks and pictures (#4) lie below the ink or above it, each a
// ContentItem; with the Type tool the ink rests and they are arranged: a tap
// on the paper puts a text block there, a tap chooses one, dragging moves
// it, its corner resizes it, a double tap types in it. A picture comes from
// a file, picked (I) or dropped on the page (PictureImport).
//
// Keys: P pen, H highlighter, E eraser (again: whole strokes or parts),
// 1 to 4 a colour, [ and ] thinner and thicker, F what a finger does,
// Ctrl+Z and Ctrl+Shift+Z undo and redo, Page Up and Page Down the page
// before and after, Backspace back to the pages. T the Type tool, I a
// picture from a file; with the Type tool, Tab and Shift+Tab choose, Enter
// types in the one chosen (or in a new block), Escape or Ctrl+Enter is done
// typing, the arrows move (Shift: further), Alt and the arrows resize,
// Delete removes, L puts it above or below the ink, [ and ] to the back or
// the front, M makes a text block Markdown or plain text.
FocusScope {
    id: page

    property string plugin: ""
    // The page shown: {id, paper, number, title} as the overview has it.
    // Before it changes, the one who changes it calls leave(), so what waits
    // for the pen's pause goes to the page it was written on.
    property var entry: null
    readonly property string pageId: entry ? entry.id : ""
    property bool hasBefore: false
    property bool hasAfter: false
    signal turn(int by)

    readonly property var tools: plugin === "" ? null : backend.scripts.call(plugin, "inkTools", [])
    // "pen", "highlighter", "eraser" or "type".
    property string tool: "pen"
    property var colourAt: ({pen: 0, highlighter: 0})
    property var widthAt: ({})
    property real zoom: 1
    property string problem: ""
    // The writes asked of the script and not answered yet.
    property var asked: ({})
    // What is on the page but its ink: text blocks and pictures.
    readonly property var chosenItem: pageContent.chosenItem

    readonly property var pen: tools ? tools.pens.find(function (one) { return one.id === (page.tool === "eraser" || page.tool === "type" ? "pen" : page.tool) }) : null
    readonly property var colours: tools && pen ? tools.colours[pen.id] : []
    readonly property real fit: Math.max(0.5, (flick.width - 24) / sheet.layout.width)

    function widthOf(id) {
        if (page.widthAt[id] !== undefined) return page.widthAt[id]
        const one = id === "eraser" ? tools.eraser : tools.pens.find(function (p) { return p.id === id })
        return one.width
    }
    function choose(id) {
        if (id !== "type") { pageContent.chosen = ""; pageContent.editing = "" }
        if (id === "eraser" && tool === "eraser")
            surface.eraser = surface.eraser === InkSurface.Parts ? InkSurface.Strokes : InkSurface.Parts
        tool = id
    }
    function chooseColour(at) {
        if (tool === "eraser" || tool === "type") choose("pen")
        if (at < 0 || at >= colours.length) return
        const next = Object.assign({}, colourAt)
        next[pen.id] = at
        colourAt = next
    }
    // A step thinner (-1) or thicker (1) of what the tool comes in.
    function thicker(by) {
        if (tool === "type") { pageContent.arrange(by < 0 ? "back" : "front"); return }
        const one = tool === "eraser" ? tools.eraser : pen
        const at = Math.max(0, Math.min(one.widths.length - 1, one.widths.indexOf(widthOf(tool)) + by))
        const next = Object.assign({}, widthAt)
        next[tool] = one.widths[at]
        widthAt = next
    }
    function zoomBy(factor) { zoom = Math.max(0.5, Math.min(3, zoom * factor)) }
    function cycleFingers() {
        surface.fingers = surface.fingers === InkSurface.Auto ? InkSurface.Draw
                        : surface.fingers === InkSurface.Draw ? InkSurface.Scroll : InkSurface.Auto
    }

    // What the log has, shown: on opening, and when the page may have been
    // written on elsewhere. What waits for the pen's pause is sent first.
    function reload() {
        if (!entry) return
        surface.flush()
        surface.load(backend.scripts.call(plugin, "strokes", [entry.id]) || {})
        pageContent.reload()
    }
    function ask(fn, args) {
        const id = backend.scripts.request(plugin, fn, args)
        const next = Object.assign({}, page.asked)
        next[id] = true
        page.asked = next
    }
    // The point of the paper under a pointer, in millimetres of the page.
    function onPaper(point) { return {x: point.x / sheet.unit, y: point.y / sheet.unit} }
    // Done with the page: what waits goes, and the notebook's file follows.
    function leave() {
        if (!entry) return
        surface.flush()
        backend.scripts.request(plugin, "pageWritten", [entry.id])
    }
    function takeFocus() { forceActiveFocus() }

    onPageIdChanged: { zoom = 1; problem = ""; reload() }
    Component.onCompleted: reload()

    Connections {
        target: backend.scripts
        function onAnswered(id, result, error) {
            if (!page.asked[id]) return
            const left = Object.assign({}, page.asked)
            delete left[id]
            page.asked = left
            if (error) {
                // Not kept: show what is, so nothing looks kept that isn't.
                page.problem = error.replace(/^.*?Error: /, "")
                page.reload()
            }
        }
    }

    Keys.onPressed: function (event) {
        const ctrl = event.modifiers & Qt.ControlModifier
        const shift = event.modifiers & Qt.ShiftModifier
        const plain = {}
        plain[Qt.Key_P] = function () { page.choose("pen") }
        plain[Qt.Key_H] = function () { page.choose("highlighter") }
        plain[Qt.Key_E] = function () { page.choose("eraser") }
        plain[Qt.Key_F] = page.cycleFingers
        plain[Qt.Key_BracketLeft] = function () { page.thicker(-1) }
        plain[Qt.Key_BracketRight] = function () { page.thicker(1) }
        plain[Qt.Key_PageUp] = function () { if (page.hasBefore) page.turn(-1) }
        plain[Qt.Key_PageDown] = function () { if (page.hasAfter) page.turn(1) }
        const withCtrl = {}
        withCtrl[Qt.Key_Z] = function () { if (shift) surface.redo(); else surface.undo() }
        withCtrl[Qt.Key_Y] = function () { surface.redo() }
        withCtrl[Qt.Key_Equal] = function () { page.zoomBy(1.25) }
        withCtrl[Qt.Key_Plus] = function () { page.zoomBy(1.25) }
        withCtrl[Qt.Key_Minus] = function () { page.zoomBy(0.8) }
        withCtrl[Qt.Key_0] = function () { page.zoom = 1 }
        plain[Qt.Key_T] = function () { page.choose("type") }
        plain[Qt.Key_I] = pageContent.pickPicture
        if (page.tool === "type")
            Object.assign(plain, pageContent.keys(event))
        const one = ctrl ? withCtrl[event.key] : plain[event.key]
        if (!ctrl && event.key >= Qt.Key_1 && event.key <= Qt.Key_4) {
            page.chooseColour(event.key - Qt.Key_1)
            event.accepted = true
        } else if (one) {
            one()
            event.accepted = true
        }
    }

    // What lies below the ink, or above it, lowest first.
    component Layer: Item {
        id: lying
        required property string kind
        anchors.fill: parent
        Repeater {
            model: pageContent.lying(lying.kind)
            delegate: ContentItem {
                required property var modelData
                item: modelData
                plugin: page.plugin
                unit: sheet.unit
                step: pageContent.content.typing.step
                arranging: page.tool === "type"
                chosen: pageContent.chosen === item.id
                editing: pageContent.editing === item.id
                onChoose: { pageContent.chosen = item.id; if (pageContent.editing !== item.id) page.takeFocus() }
                onEdit: { pageContent.chosen = item.id; pageContent.editing = item.id }
                onPlaced: (rectangle) => pageContent.placeItem(item.id, rectangle)
                onTyped: (text, needs) => pageContent.typed(item.id, text, needs)
            }
        }
    }

    PageContent {
        id: pageContent
        plugin: page.plugin
        pageId: page.pageId
        onProblem: (why) => page.problem = why
        onDoneTyping: page.takeFocus()
        onPictureAdded: { page.problem = ""; page.choose("type") }
    }

    component Tool: Button {
        flat: true
        checkable: false
        focusPolicy: Qt.NoFocus
        font.pixelSize: 13
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 6

        // The tools, wrapped where the view is narrow.
        Flow {
            Layout.fillWidth: true
            spacing: 4

            Repeater {
                model: page.tools ? page.tools.pens : []
                delegate: Tool {
                    required property var modelData
                    text: modelData.title + " (" + modelData.key + ")"
                    highlighted: page.tool === modelData.id
                    onClicked: page.choose(modelData.id)
                }
            }
            Tool {
                text: (surface.eraser === InkSurface.Strokes ? "Eraser: whole strokes" : "Eraser") + " (E)"
                highlighted: page.tool === "eraser"
                onClicked: page.choose("eraser")
            }
            Tool { text: "Type (T)"; highlighted: page.tool === "type"; onClicked: page.choose("type") }
            Tool { text: "Picture… (I)"; onClicked: pageContent.pickPicture() }
            Tool { text: "Above ink (L)"; visible: !!page.chosenItem && page.chosenItem.layer === "below"; onClicked: pageContent.arrange("above") }
            Tool { text: "Below ink (L)"; visible: !!page.chosenItem && page.chosenItem.layer === "above"; onClicked: pageContent.arrange("below") }
            Tool { text: "To the back ["; visible: !!page.chosenItem; onClicked: pageContent.arrange("back") }
            Tool { text: "To the front ]"; visible: !!page.chosenItem; onClicked: pageContent.arrange("front") }
            Tool {
                visible: !!page.chosenItem && page.chosenItem.kind === "text"
                text: (page.chosenItem && page.chosenItem.format === "plain" ? "Plain text" : "Markdown") + " (M)"
                onClicked: pageContent.toggleFormat()
            }
            Tool { text: "Remove (Delete)"; visible: !!page.chosenItem; onClicked: pageContent.removeChosen() }
            Repeater {
                model: page.tool === "type" ? [] : page.colours
                delegate: Item {
                    id: swatch
                    required property var modelData
                    required property int index
                    width: 30
                    height: 30
                    Accessible.role: Accessible.Button
                    Accessible.name: modelData.title
                    ToolTip.visible: swatchHover.hovered
                    ToolTip.delay: 500
                    ToolTip.text: modelData.title + " (" + (index + 1) + ")"
                    readonly property bool chosen: page.tool !== "eraser" && page.colourAt[page.pen.id] === index
                    Rectangle {
                        anchors.centerIn: parent
                        width: 22
                        height: 22
                        radius: 11
                        color: swatch.modelData.value
                        border.width: swatch.chosen ? 3 : 1
                        border.color: swatch.chosen ? theme.foreground : theme.colors.selection
                    }
                    HoverHandler { id: swatchHover; cursorShape: Qt.PointingHandCursor }
                    TapHandler { onTapped: page.chooseColour(swatch.index) }
                }
            }
            Tool { text: "Thinner ["; visible: page.tool !== "type"; onClicked: page.thicker(-1) }
            Tool { text: "Thicker ]"; visible: page.tool !== "type"; onClicked: page.thicker(1) }
            Tool { text: "Undo"; enabled: surface.canUndo; onClicked: surface.undo() }
            Tool { text: "Redo"; enabled: surface.canRedo; onClicked: surface.redo() }
            Tool { text: "Clear page"; enabled: surface.count > 0; onClicked: surface.clear() }
            Tool {
                text: surface.fingers === InkSurface.Draw ? "Finger writes (F)"
                    : surface.fingers === InkSurface.Scroll ? "Finger scrolls (F)"
                    : (surface.penSeen ? "Finger scrolls, pen writes (F)" : "Finger writes until a pen is seen (F)")
                onClicked: page.cycleFingers()
            }
            Tool { text: "−"; onClicked: page.zoomBy(0.8) }
            Tool { text: Math.round(page.zoom * 100) + "%"; onClicked: page.zoom = 1 }
            Tool { text: "+"; onClicked: page.zoomBy(1.25) }
            Tool { text: "Page before"; visible: page.hasBefore; onClicked: page.turn(-1) }
            Tool { text: "Page after"; visible: page.hasAfter; onClicked: page.turn(1) }
        }

        Label {
            Layout.fillWidth: true
            visible: page.problem !== ""
            text: page.problem
            color: theme.colors.red || theme.accent
            wrapMode: Text.Wrap
        }

        Flickable {
            id: flick
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            contentWidth: Math.max(width, sheet.width + 24)
            contentHeight: sheet.height + 24
            boundsBehavior: Flickable.StopAtBounds
            // A finger scrolls through the surface once the pen is the one writing.
            interactive: surface.fingers !== InkSurface.Draw && !surface.writing
            ScrollBar.vertical: ScrollBar {}
            ScrollBar.horizontal: ScrollBar {}

            PaperSheet {
                id: sheet
                plugin: page.plugin
                paper: page.entry ? page.entry.paper : ({})
                x: Math.max(12, (flick.width - width) / 2)
                y: 12
                width: layout.width * page.fit * page.zoom
                height: implicitHeight

                // A tap on the paper, with the Type tool, puts a text block there.
                TapHandler {
                    enabled: page.tool === "type" && pageContent.editing === ""
                    onTapped: (point) => {
                        const at = page.onPaper(point.position)
                        if (pageContent.hit(at)) return
                        if (pageContent.chosen !== "") pageContent.chosen = ""
                        else pageContent.newText(at)
                    }
                }
                Layer { kind: "below" }

                InkSurface {
                    id: surface
                    objectName: "pageInk"
                    anchors.fill: parent
                    inkScale: sheet.unit
                    tool: page.tool === "eraser" ? InkSurface.Eraser : InkSurface.Pen
                    color: page.colours.length ? page.colours[page.colourAt[page.pen.id] || 0].value : "#1d1d1f"
                    penWidth: page.tools && page.pen ? page.widthOf(page.pen.id) : 0.5
                    eraserWidth: page.tools ? page.widthOf("eraser") : 24
                    batchPause: 600
                    readOnly: !page.entry || page.tool === "type"
                    Accessible.role: Accessible.Graphic
                    Accessible.name: page.entry ? (page.entry.title + ", " + surface.count + (surface.count === 1 ? " stroke" : " strokes")) : ""
                    onInked: (batch) => {
                        if (!page.entry) return
                        page.ask("ink", [page.entry.id, batch])
                    }
                }
                Layer { kind: "above" }

                // A picture file dropped on the page goes where it was dropped.
                DropArea {
                    anchors.fill: parent
                    keys: ["text/uri-list"]
                    onDropped: (drop) => {
                        if (!drop.hasUrls || !page.entry) return
                        pageContent.takePicture(drop.urls[0], page.onPaper(Qt.point(drop.x, drop.y)))
                        drop.acceptProposedAction()
                    }
                }
            }

            WheelHandler {
                acceptedModifiers: Qt.ControlModifier
                onWheel: (event) => page.zoomBy(event.angleDelta.y > 0 ? 1.1 : 1 / 1.1)
            }
            PinchHandler {
                target: null
                property real from: 1
                onActiveChanged: if (active) from = page.zoom
                onActiveScaleChanged: page.zoom = Math.max(0.5, Math.min(3, from * activeScale))
            }
        }
    }
}
