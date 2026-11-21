pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import Omabook

// The tools above a page (InkPage), wrapped where the view is narrow: the
// pens, the eraser, Type, Select and the lasso (#3, with what it does to what
// it holds), what is shown beside the page, what is chosen of the text
// blocks and pictures (#4), the
// colours and widths, undo and redo, the fingers, zoom and the pages before
// and after. Each says its key; the keys themselves are the page's.
Flow {
    id: tools

    required property InkPage page
    spacing: 4

    component Tool: Button {
        flat: true
        checkable: false
        focusPolicy: Qt.NoFocus
        font.pixelSize: 13
    }

    Repeater {
        model: tools.page.tools ? tools.page.tools.pens : []
        delegate: Tool {
            required property var modelData
            text: modelData.title + " (" + modelData.key + ")"
            highlighted: tools.page.tool === modelData.id
            onClicked: tools.page.choose(modelData.id)
        }
    }
    Tool {
        text: (tools.page.ink.eraser === InkSurface.Strokes ? "Eraser: whole strokes" : "Eraser") + " (E)"
        highlighted: tools.page.tool === "eraser"
        onClicked: tools.page.choose("eraser")
    }
    Tool { text: "Type (T)"; highlighted: tools.page.tool === "type"; onClicked: tools.page.choose("type") }
    Tool { text: "Select (S)"; highlighted: tools.page.tool === "select"; onClicked: tools.page.choose("select") }
    Tool { text: "Lasso (L)"; highlighted: tools.page.tool === "lasso"; onClicked: tools.page.choose("lasso") }
    Tool { text: "Copy"; visible: tools.page.lassoed > 0; onClicked: tools.page.ink.selection.copy() }
    Tool { text: "Cut"; visible: tools.page.lassoed > 0; onClicked: tools.page.ink.selection.cut() }
    Tool { text: "Paste"; visible: tools.page.tool === "lasso"; onClicked: tools.page.ink.selection.paste() }
    Tool { text: "Take away"; visible: tools.page.lassoed > 0; onClicked: tools.page.ink.selection.remove() }
    Tool { text: "Text (R)"; highlighted: tools.page.showText; onClicked: tools.page.showText = !tools.page.showText }
    Tool { text: "Picture… (I)"; onClicked: tools.page.items.pickPicture() }
    Tool { text: "Listen (A)"; highlighted: tools.page.tool === "listen"; onClicked: tools.page.choose("listen") }
    Tool { text: "Said (W)"; highlighted: tools.page.showSaid; onClicked: tools.page.showSaid = !tools.page.showSaid }
    Tool { text: "About (K)"; highlighted: tools.page.showAbout; onClicked: tools.page.showAbout = !tools.page.showAbout }
    Tool { text: "Above ink (L)"; visible: !!tools.page.chosenItem && tools.page.chosenItem.layer === "below"; onClicked: tools.page.items.arrange("above") }
    Tool { text: "Below ink (L)"; visible: !!tools.page.chosenItem && tools.page.chosenItem.layer === "above"; onClicked: tools.page.items.arrange("below") }
    Tool { text: "To the back ["; visible: !!tools.page.chosenItem; onClicked: tools.page.items.arrange("back") }
    Tool { text: "To the front ]"; visible: !!tools.page.chosenItem; onClicked: tools.page.items.arrange("front") }
    Tool {
        visible: !!tools.page.chosenItem && tools.page.chosenItem.kind === "text"
        text: (tools.page.chosenItem && tools.page.chosenItem.format === "plain" ? "Plain text" : "Markdown") + " (M)"
        onClicked: tools.page.items.toggleFormat()
    }
    Tool { text: "Remove (Delete)"; visible: !!tools.page.chosenItem; onClicked: tools.page.items.removeChosen() }
    Repeater {
        model: tools.page.resting ? [] : tools.page.colours
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
            readonly property bool chosen: tools.page.tool !== "eraser" && tools.page.colourAt[tools.page.pen.id] === index
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
            TapHandler { onTapped: tools.page.chooseColour(swatch.index) }
        }
    }
    Tool { text: "Thinner ["; visible: !tools.page.resting; onClicked: tools.page.thicker(-1) }
    Tool { text: "Thicker ]"; visible: !tools.page.resting; onClicked: tools.page.thicker(1) }
    Tool { text: "Undo"; enabled: tools.page.ink.canUndo; onClicked: tools.page.ink.undo() }
    Tool { text: "Redo"; enabled: tools.page.ink.canRedo; onClicked: tools.page.ink.redo() }
    Tool { text: "Clear page"; enabled: tools.page.ink.count > 0; onClicked: tools.page.ink.clear() }
    Tool {
        text: tools.page.ink.fingers === InkSurface.Draw ? "Finger writes (F)"
            : tools.page.ink.fingers === InkSurface.Scroll ? "Finger scrolls (F)"
            : (tools.page.ink.penSeen ? "Finger scrolls, pen writes (F)" : "Finger writes until a pen is seen (F)")
        onClicked: tools.page.cycleFingers()
    }
    Tool { text: "−"; onClicked: tools.page.zoomBy(0.8) }
    Tool { text: Math.round(tools.page.zoom * 100) + "%"; onClicked: tools.page.zoom = 1 }
    Tool { text: "+"; onClicked: tools.page.zoomBy(1.25) }
    Tool { text: "Page before"; visible: tools.page.hasBefore; onClicked: tools.page.turn(-1) }
    Tool { text: "Page after"; visible: tools.page.hasAfter; onClicked: tools.page.turn(1) }
}
