pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls

// One text block or picture on a page (#4), as the script lists it
// (`content()`): placed in millimetres, `unit` pixels to one. Its words are
// shown as Markdown or plain text (never HTML: the script cleaned them), set
// on the paper's lines, `step` millimetres apart; a picture is its bytes as
// the script hands them back. While the page is being arranged it is chosen
// with a tap, moved by dragging it, resized by its corner, and a text block
// is typed in where it is with a double tap (or Enter, InkPage). It says
// what was done and the page asks the script; it keeps nothing itself.
Item {
    id: block

    required property var item
    property string plugin: ""
    property real unit: 1
    property real step: 7.1
    // The page is being arranged (the Type tool): it may be chosen and moved.
    property bool arranging: false
    property bool chosen: false
    property bool editing: false
    readonly property bool isText: item.kind === "text"
    // A picture's bytes, "" while they are on their way from another computer.
    property string picture: ""
    // Where a text block is typed in: the rail's microphone says into it (#13).
    readonly property alias field: editor

    signal choose()
    signal edit()
    // In millimetres: {x, y} moved, {width, height} resized.
    signal placed(var rectangle)
    // Typing done: the words, and how many millimetres high they need.
    signal typed(string text, real needs)

    property point moving: Qt.point(0, 0)
    property point growing: Qt.point(0, 0)
    readonly property real ratio: item.height / Math.max(0.01, item.width)

    x: item.x * unit + moving.x
    y: item.y * unit + moving.y
    width: Math.max(5 * unit, item.width * unit + growing.x)
    height: isText ? Math.max(item.height * unit, (editing ? editor.implicitHeight : words.implicitHeight))
                   : width * ratio

    function fetch() {
        if (!isText && picture === "" && plugin !== "")
            picture = backend.scripts.call(plugin, "picture", [item.id]) || ""
    }
    function finish() {
        if (!editing) return
        typed(editor.text, Math.ceil(editor.implicitHeight / (step * unit) - 0.05) * step)
    }
    Component.onCompleted: fetch()
    onEditingChanged: if (editing) { editor.text = item.text; editor.forceActiveFocus(); editor.cursorPosition = editor.length }

    Accessible.role: isText ? Accessible.StaticText : Accessible.Graphic
    Accessible.name: isText ? item.text : ("Picture" + (item.title ? " " + item.title : ""))

    readonly property real fontSize: Math.max(4, step * unit * 0.58)

    FontMetrics { id: metrics; font.pixelSize: block.fontSize }

    Text {
        id: words
        visible: block.isText && !block.editing
        width: parent.width
        text: block.isText ? block.item.text : ""
        textFormat: block.isText && block.item.format === "plain" ? Text.PlainText : Text.MarkdownText
        wrapMode: Text.Wrap
        // On the lines: each line of words is one ruling high and sits on the rule under it.
        font.pixelSize: block.fontSize
        lineHeight: block.step * block.unit
        lineHeightMode: Text.FixedHeight
        // Each line is drawn from its top: pushed down so its letters stand on the rule below.
        topPadding: Math.max(0, block.step * block.unit - metrics.ascent - 1)
        // Paper is paper in a dark theme too (PaperSheet), so typed words are dark as ink is.
        color: "#1d1d1f"
        linkColor: "#2f5fb3"
        onLinkActivated: (link) => { if (/^(https?:|mailto:)/i.test(link)) Qt.openUrlExternally(link) }
    }

    TextArea {
        id: editor
        visible: block.editing
        width: parent.width
        wrapMode: TextEdit.Wrap
        textFormat: TextEdit.PlainText
        font.pixelSize: block.fontSize
        color: "#1d1d1f"
        padding: 0
        leftPadding: 0
        rightPadding: 0
        topPadding: 0
        bottomPadding: 0
        Accessible.name: "Text block: Markdown, or plain text (M). Escape or Ctrl+Enter when done."
        background: Rectangle { color: "#fdfcf8"; border.width: 1; border.color: theme.accent }
        Keys.onEscapePressed: block.finish()
        Keys.onReturnPressed: (event) => { if (event.modifiers & Qt.ControlModifier) block.finish(); else event.accepted = false }
        onActiveFocusChanged: if (!activeFocus) block.finish()
    }

    Image {
        visible: !block.isText && block.picture !== ""
        anchors.fill: parent
        source: block.picture
        fillMode: Image.Stretch
        asynchronous: true
        smooth: true
        mipmap: true
    }
    Rectangle {
        visible: !block.isText && block.picture === ""
        anchors.fill: parent
        color: "#eceae4"
        border.color: "#b4c0d0"
        Text {
            anchors.centerIn: parent
            width: parent.width - 8
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
            text: "This picture is still on its way from another computer."
            color: "#5a5a5a"
            font.pixelSize: 11
        }
    }

    // Chosen: a frame, and a corner to resize it by.
    Rectangle {
        visible: block.chosen || (block.arranging && hover.hovered)
        anchors.fill: parent
        anchors.margins: -3
        color: "transparent"
        border.width: block.chosen ? 2 : 1
        border.color: theme.accent
        radius: 2
    }
    Rectangle {
        id: corner
        visible: block.chosen && block.arranging && !block.editing
        width: 18
        height: 18
        radius: 9
        x: parent.width - width / 2
        y: parent.height - height / 2
        color: theme.accent
        Accessible.role: Accessible.Grip
        Accessible.name: "Resize (Alt and the arrows)"
        DragHandler {
            target: null
            onActiveTranslationChanged: if (active) block.growing = Qt.point(activeTranslation.x, activeTranslation.y)
            onActiveChanged: {
                if (active) return
                const width = Math.max(5, block.item.width + block.growing.x / block.unit)
                const height = block.isText ? Math.max(block.step, block.item.height + block.growing.y / block.unit) : width * block.ratio
                block.growing = Qt.point(0, 0)
                block.placed({width: width, height: height})
            }
        }
        HoverHandler { cursorShape: Qt.SizeFDiagCursor }
    }

    HoverHandler { id: hover; enabled: block.arranging; cursorShape: block.editing ? Qt.IBeamCursor : Qt.SizeAllCursor }
    TapHandler {
        enabled: block.arranging && !block.editing
        onTapped: block.choose()
        onDoubleTapped: if (block.isText) block.edit()
    }
    DragHandler {
        target: null
        enabled: block.arranging && !block.editing
        onActiveTranslationChanged: if (active) block.moving = Qt.point(activeTranslation.x, activeTranslation.y)
        onActiveChanged: {
            if (active) {
                block.choose()
                return
            }
            const moved = {x: block.item.x + block.moving.x / block.unit, y: block.item.y + block.moving.y / block.unit}
            block.moving = Qt.point(0, 0)
            block.placed(moved)
        }
    }
}
