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
// The page's handwriting is read to text a moment after the pen rests
// (RecognisedText, #6), shown under the tools on request (R); with the
// Select tool (S) a rectangle dragged over the page chooses strokes, to be
// read on their own. What is said while writing is recorded with the ink
// (PageRecordings, #5): V records and stops, A the Listen tool (a tap on
// the ink plays from when it was written), W the transcripts beside it.
// K shows what the page is about in the knowledge graph (PageAbout, #7).
// The lasso (L) goes around strokes to move them (drag), recolour them (1
// to 4), copy, cut, paste or take them away (the ink surface's keys: Ctrl+C,
// Ctrl+X, Ctrl+V, Delete); each is an ink batch, as erasing is. Beside a
// book (#8), B refers to where the reader is (Shift+B to the words copied
// there), tied to what the lasso or the Select tool holds or the text block
// chosen; the chips (PageReferences) open the book there, G the next one.
// The page is the whole view (#14): it fits the height, and zoom stays from
// page to page. In its margin a slim column (PageRail) has the way back, the
// pens, the eraser, the colours, undo, recording and what was said; every
// tool (PageTools) shows above the page with \ or the rail's handle, and
// Escape puts them away again.
//
// Keys: P pen, H highlighter, E eraser (again: whole strokes or parts),
// 1 to 4 a colour, [ and ] thinner and thicker, F what a finger does,
// Ctrl+Z and Ctrl+Shift+Z undo and redo, Page Up and Page Down the page
// before and after, Backspace back to the pages. T the Type tool, I a
// picture from a file; with the Type tool, Tab and Shift+Tab choose, Enter
// types in the one chosen (or in a new block), Escape or Ctrl+Enter is done
// typing, the arrows move (Shift: further), Alt and the arrows resize,
// Delete removes, L puts it above or below the ink, [ and ] to the back or
// the front, M makes a text block Markdown or plain text. R shows or hides
// the recognised text, S the Select tool.
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
    property bool loose: false
    // Where the page is, for the way back: "Page 2 of 5 · Physics".
    property string where: ""
    signal turn(int by)
    signal back()
    signal exportAsked()
    // Every tool shown above the page, not only the margin's.
    property bool allTools: false

    readonly property var tools: plugin === "" ? null : backend.scripts.call(plugin, "inkTools", [])
    // "pen", "highlighter", "eraser", "lasso", "type", "select" or "listen".
    property string tool: "pen"
    property var colourAt: ({pen: 0, highlighter: 0})
    property var widthAt: ({})
    property real zoom: 1
    property bool showText: false
    property bool showSaid: false
    property bool showAbout: false
    // The strokes the Select tool chose, and the rectangle it chose them with (millimetres).
    property var selection: []
    property var selected: null
    property string problem: ""
    // The writes asked of the script and not answered yet.
    property var asked: ({})
    // What is on the page but its ink: text blocks and pictures.
    readonly property var chosenItem: pageContent.chosenItem
    // For PageTools: the ink surface, the text blocks and pictures, and what the lasso holds.
    readonly property alias ink: surface
    readonly property alias items: pageContent
    readonly property int lassoed: surface.selection.count
    readonly property int referenceCount: references.list.length
    readonly property alias recordings: pageRecordings

    readonly property bool resting: tool === "type" || tool === "select" || tool === "listen"
    readonly property var pen: tools ? tools.pens.find(function (one) {
        return one.id === (page.tool === "eraser" || page.tool === "lasso" || page.resting ? "pen" : page.tool)
    }) : null
    readonly property var colours: tools && pen ? tools.colours[pen.id] : []
    // The whole page in the view, its height or its width, whichever is less.
    readonly property real fit: Math.max(0.5, Math.min((flick.width - 24) / sheet.layout.width, (flick.height - 24) / sheet.layout.height))

    function widthOf(id) {
        if (page.widthAt[id] !== undefined) return page.widthAt[id]
        const one = id === "eraser" ? tools.eraser : tools.pens.find(function (p) { return p.id === id })
        return one.width
    }
    function choose(id) {
        if (id !== "type") { pageContent.chosen = ""; pageContent.editing = "" }
        if (id !== "select") { selection = []; selected = null }
        if (id !== "lasso") surface.selection.clear()
        if (id === "eraser" && tool === "eraser")
            surface.eraser = surface.eraser === InkSurface.Parts ? InkSurface.Strokes : InkSurface.Parts
        tool = id
    }
    function chooseColour(at) {
        if (tool === "lasso" && lassoed > 0) {
            if (at >= 0 && at < colours.length) surface.selection.recolor(colours[at].value)
            return
        }
        if (tool === "eraser" || tool === "lasso" || resting) choose("pen")
        if (at < 0 || at >= colours.length) return
        const next = Object.assign({}, colourAt)
        next[pen.id] = at
        colourAt = next
    }
    // A step thinner (-1) or thicker (1) of what the tool comes in.
    function thicker(by) {
        if (tool === "type") { pageContent.arrange(by < 0 ? "back" : "front"); return }
        if (tool === "select" || tool === "lasso") return
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
        references.reload()
    }
    function ask(fn, args) {
        const id = backend.scripts.request(plugin, fn, args)
        const next = Object.assign({}, page.asked)
        next[id] = true
        page.asked = next
    }
    // The point of the paper under a pointer, in millimetres of the page.
    function onPaper(point) { return {x: point.x / sheet.unit, y: point.y / sheet.unit} }
    // The strokes that lie within a rectangle of the page, in millimetres.
    function strokesIn(r) {
        const lying = backend.scripts.call(plugin, "strokeBounds", [pageId]) || {}
        return Object.keys(lying).filter(function (id) {
            const b = lying[id]
            return b.x < r.x + r.width && b.x + b.width > r.x && b.y < r.y + r.height && b.y + b.height > r.y
        })
    }
    function select(from, to) {
        selected = {x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width: Math.abs(to.x - from.x), height: Math.abs(to.y - from.y)}
        selection = strokesIn(selected)
        if (selection.length) showText = true
    }
    // What the lasso holds, by id: as the surface says (where it does), else the strokes within its box.
    function lassoIds() {
        const held = surface.selection
        if (!held.count) return []
        if (held.ids !== undefined) return held.ids
        return strokesIn({x: held.box.x / sheet.unit, y: held.box.y / sheet.unit, width: held.box.width / sheet.unit, height: held.box.height / sheet.unit})
    }
    // A place reference to the book being read, at where the reader is or on
    // the words copied there, tied to what is held of the page.
    function refer(copied) {
        if (!entry) return
        problem = ""
        const details = {}
        const held = tool === "lasso" ? lassoIds() : tool === "select" ? selection : []
        if (held.length) details.strokes = held
        else if (chosenItem) details.block = chosenItem.id
        references.make(copied ? "referCopied" : "refer", details)
    }
    function followReference(by) { problem = ""; references.follow(by) }
    // Done with the page: what waits goes, and the notebook's file follows.
    function leave() {
        if (!entry) return
        surface.flush()
        backend.scripts.request(plugin, "pageWritten", [entry.id])
    }
    function takeFocus() { forceActiveFocus() }

    onPageIdChanged: { problem = ""; selection = []; selected = null; reload() }
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
        plain[Qt.Key_S] = function () { page.choose("select") }
        plain[Qt.Key_R] = function () { page.showText = !page.showText }
        plain[Qt.Key_I] = pageContent.pickPicture
        plain[Qt.Key_V] = pageRecordings.toggle
        plain[Qt.Key_A] = function () { page.choose("listen") }
        plain[Qt.Key_W] = function () { page.showSaid = !page.showSaid }
        plain[Qt.Key_K] = function () { page.showAbout = !page.showAbout }
        plain[Qt.Key_L] = function () { page.choose("lasso") }
        plain[Qt.Key_B] = function () { page.refer(shift) }
        plain[Qt.Key_G] = function () { page.followReference(shift ? -1 : 1) }
        plain[Qt.Key_Backslash] = function () { page.allTools = !page.allTools }
        if (page.allTools) plain[Qt.Key_Escape] = function () { page.allTools = false }
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

    PageRail {
        id: rail
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: implicitWidth
        page: page
        where: page.where
        onBack: page.back()
    }

    ColumnLayout {
        anchors.left: rail.right
        anchors.leftMargin: 4
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        spacing: 6

        PageTools {
            Layout.fillWidth: true
            visible: page.allTools
            page: page
        }

        Label {
            Layout.fillWidth: true
            visible: page.problem !== ""
            text: page.problem
            color: theme.colors.red || theme.accent
            wrapMode: Text.Wrap
        }

        RecognisedText {
            id: recognisedText
            Layout.fillWidth: true
            visible: page.showText
            plugin: page.plugin
            pageId: page.pageId
            selection: page.selection
            onProblem: (why) => page.problem = why
            onChanged: { page.selection = []; page.selected = null; page.reload() }
        }

        PageAbout {
            Layout.fillWidth: true
            visible: page.showAbout
            plugin: page.plugin
            pageId: page.pageId
            loose: page.loose
            onProblem: (why) => page.problem = why
        }

        Flickable {
            id: flick
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.rightMargin: transcriptPane.visible && !page.narrow ? transcriptPane.width + 6 : 0
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
                    tool: page.tool === "eraser" ? InkSurface.Eraser : page.tool === "lasso" ? InkSurface.Lasso : InkSurface.Pen
                    selection.color: theme.accent
                    color: page.colours.length ? page.colours[page.colourAt[page.pen.id] || 0].value : "#1d1d1f"
                    penWidth: page.tools && page.pen ? page.widthOf(page.pen.id) : 0.5
                    eraserWidth: page.tools ? page.widthOf("eraser") : 24
                    batchPause: 600
                    readOnly: !page.entry || page.resting || pageRecordings.replaying
                    Accessible.role: Accessible.Graphic
                    Accessible.name: page.entry ? (page.entry.title + ", " + surface.count + (surface.count === 1 ? " stroke" : " strokes")) : ""
                    onInked: (batch) => {
                        if (!page.entry) return
                        page.ask("ink", [page.entry.id, batch])
                        recognisedText.inkChanged()
                    }
                }
                Layer { kind: "above" }
                PageReferences {
                    id: references
                    anchors.fill: parent
                    plugin: page.plugin
                    pageId: page.pageId
                    unit: sheet.unit
                    arranging: page.tool === "type"
                    onProblem: (why) => page.problem = why
                }
                InkMoments {
                    anchors.fill: parent
                    plugin: page.plugin
                    pageId: page.pageId
                    unit: sheet.unit
                    listening: page.tool === "listen"
                    glowing: pageRecordings.glowing
                    onTapped: (at) => pageRecordings.playFrom(at)
                }

                // The Select tool: a rectangle dragged over the page chooses the strokes in it.
                Rectangle {
                    visible: page.tool === "select" && !!page.selected
                    x: page.selected ? page.selected.x * sheet.unit : 0
                    y: page.selected ? page.selected.y * sheet.unit : 0
                    width: page.selected ? page.selected.width * sheet.unit : 0
                    height: page.selected ? page.selected.height * sheet.unit : 0
                    color: "transparent"
                    border.color: theme.accent
                    border.width: 1
                }
                DragHandler {
                    enabled: page.tool === "select"
                    target: null
                    onActiveChanged: if (!active) page.select(page.onPaper(centroid.pressPosition), page.onPaper(centroid.position))
                    onCentroidChanged: if (active) page.selected = {
                        x: Math.min(centroid.pressPosition.x, centroid.position.x) / sheet.unit,
                        y: Math.min(centroid.pressPosition.y, centroid.position.y) / sheet.unit,
                        width: Math.abs(centroid.position.x - centroid.pressPosition.x) / sheet.unit,
                        height: Math.abs(centroid.position.y - centroid.pressPosition.y) / sheet.unit
                    }
                }

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

        PageRecordings {
            id: pageRecordings
            Layout.fillWidth: true
            faded: surface.writing
            plugin: page.plugin
            pageId: page.pageId
            onProblem: (why) => page.problem = why
            onShowInk: (strokes) => surface.load(strokes)
            onReplayed: page.reload()
            onTranscribed: transcriptPane.reload()
        }
    }

    // Beside the page where there is room, over it where there isn't.
    readonly property bool narrow: width < 720
    TranscriptPane {
        id: transcriptPane
        visible: page.showSaid
        plugin: page.plugin
        pageId: page.pageId
        playing: pageRecordings.playing
        anchors.right: parent.right
        y: flick.y
        width: page.narrow ? page.width : 300
        height: flick.height
        onPlay: (id, at) => pageRecordings.ask("play", [id, at])
    }
}
