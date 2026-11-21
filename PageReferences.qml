pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls

// A page's place references (#8), each a chip where it stands on the page:
// the book, its chapter and the words it refers to. A click or a tap on one
// opens the book there, beside the notebook, found again by its words if the
// book's file changed; one past where a shared notebook's reader has read
// says so, and opens only when asked. With the Type tool a chip is dragged
// to another place, and its × takes it away. `follow(by)` goes to the next
// (or the one before) from the keyboard (G and Shift+G, InkPage). Where it
// stands is in millimetres, `unit` pixels to one; it keeps nothing itself.
Item {
    id: chips

    property string plugin: ""
    property string pageId: ""
    property real unit: 1
    property bool arranging: false
    property var list: []
    // The chip the keyboard came to last, by its index.
    property int at: -1
    // What was asked of the script and not answered yet.
    property int asked: -1
    signal problem(string why)

    function reload() { list = pageId === "" ? [] : (backend.scripts.call(plugin, "references", [pageId]) || []) }
    function ask(fn, args) { asked = backend.scripts.request(plugin, fn, args) }
    // A new reference on the page, by `refer` or `referCopied` (main.js).
    function make(fn, details) { if (pageId !== "") ask(fn, [pageId, details]) }
    function go(one, anyway) {
        if (one.lost) { problem("The words this refers to aren't in the book any more: “" + one.quote.slice(0, 60) + "”."); return }
        if (!one.here) { problem("The book this refers to (" + one.title + ") isn't in the library on this computer."); return }
        ask("followReference", [one.id, {anyway: !!anyway}])
    }
    function follow(by) {
        if (!list.length) { problem("This page refers to no place in a book yet: B refers to where the reader is."); return }
        at = ((at < 0 && by < 0 ? 0 : at) + by + list.length) % list.length
        go(list[at], false)
    }

    onPageIdChanged: { at = -1; reload() }
    Component.onCompleted: reload()

    Connections {
        target: backend.scripts
        function onAnswered(id, result, error) {
            if (id !== chips.asked) return
            chips.asked = -1
            if (error) chips.problem(error.replace(/^.*?Error: /, ""))
            chips.reload()
        }
    }

    Repeater {
        model: chips.list
        delegate: Rectangle {
            id: chip
            required property var modelData
            required property int index
            property point moving: Qt.point(0, 0)
            x: modelData.x * chips.unit + moving.x
            y: modelData.y * chips.unit + moving.y
            width: Math.min(Math.max(row.implicitWidth + 12, 10 * chips.unit), 70 * chips.unit)
            height: Math.max(row.implicitHeight + 6, 6 * chips.unit)
            radius: height / 2
            color: modelData.lost ? theme.colors.selection : Qt.rgba(theme.accent.r, theme.accent.g, theme.accent.b, 0.16)
            border.color: chips.at === index ? theme.foreground : theme.accent
            border.width: chips.at === index ? 2 : 1
            Accessible.role: Accessible.Link
            Accessible.name: "Open " + modelData.title + " at " + modelData.chapter
            ToolTip.visible: chipHover.hovered
            ToolTip.delay: 500
            ToolTip.text: modelData.ahead ? "Past where you have read to; click to open it anyway."
                        : modelData.lost ? "Lost: these words aren't in the book any more."
                        : "“" + modelData.quote + "”"

            Row {
                id: row
                anchors.verticalCenter: parent.verticalCenter
                x: 6
                spacing: 4
                Label {
                    text: "↗ " + chip.modelData.title + ", " + chip.modelData.chapter
                          + (chip.modelData.ahead ? " (ahead)" : chip.modelData.lost ? " (lost)" : "")
                    font.pixelSize: Math.max(9, Math.min(13, 3.2 * chips.unit))
                    color: theme.foreground
                    elide: Text.ElideRight
                    width: Math.min(implicitWidth, 64 * chips.unit - (cross.visible ? cross.width : 0))
                }
                Label {
                    id: cross
                    visible: chips.arranging
                    text: "×"
                    font.pixelSize: Math.max(10, Math.min(15, 3.6 * chips.unit))
                    color: theme.colors.muted
                    TapHandler { onTapped: chips.ask("removeReference", [chip.modelData.id]) }
                }
            }
            HoverHandler { id: chipHover; cursorShape: chips.arranging ? Qt.SizeAllCursor : Qt.PointingHandCursor }
            TapHandler {
                enabled: !chips.arranging
                onTapped: { chips.at = chip.index; chips.go(chip.modelData, chip.modelData.ahead) }
            }
            DragHandler {
                enabled: chips.arranging
                target: null
                onTranslationChanged: chip.moving = Qt.point(translation.x, translation.y)
                onActiveChanged: if (!active) {
                    const to = {x: chip.modelData.x + chip.moving.x / chips.unit, y: chip.modelData.y + chip.moving.y / chips.unit}
                    chip.moving = Qt.point(0, 0)
                    chips.ask("placeReference", [chip.modelData.id, to])
                }
            }
        }
    }
}
