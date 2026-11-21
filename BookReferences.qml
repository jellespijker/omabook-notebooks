pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Beside a book (#8): every place reference to it, in every notebook, in the
// order of the book, with its notebook, page, chapter and words. Choosing one
// opens its page and takes the reader to its passage; Enter does the same for
// the one the arrows came to. What it lists comes from the script
// (`bookReferences`), read again when another book is opened.
ColumnLayout {
    id: listing

    property string plugin: ""
    property var list: []
    // A reference chosen: its notebook ("" for the loose notes), its page, and itself.
    signal go(var reference)

    spacing: 2
    function reload() {
        list = reader.open && reader.bookId > 0 ? (backend.scripts.call(plugin, "bookReferences", [reader.bookId]) || []) : []
    }
    Component.onCompleted: reload()
    onVisibleChanged: if (visible) reload()
    Connections {
        target: reader
        function onBookChanged() { listing.reload() }
    }

    Label {
        Layout.fillWidth: true
        text: listing.list.length ? "In " + reader.title + " (" + listing.list.length + ")"
                                  : "Nothing refers to " + reader.title + " yet: a new page here, or B on a page, refers to where you are."
        color: theme.colors.muted
        font.pixelSize: 12
        wrapMode: Text.Wrap
    }
    ListView {
        id: references
        Layout.fillWidth: true
        Layout.preferredHeight: Math.min(contentHeight, 180)
        visible: listing.list.length > 0
        clip: true
        model: listing.list
        keyNavigationEnabled: true
        Keys.onReturnPressed: if (currentIndex >= 0) listing.go(listing.list[currentIndex])
        delegate: ItemDelegate {
            required property var modelData
            required property int index
            width: ListView.view.width
            highlighted: ListView.isCurrentItem
            text: modelData.chapter + "  ·  " + modelData.notebookTitle + ", page " + modelData.number
                  + (modelData.ahead ? "  (past where you are)" : modelData.lost ? "  (lost)" : "\n“" + modelData.quote + "”")
            font.pixelSize: 12
            onClicked: { references.currentIndex = index; listing.go(modelData) }
        }
    }
}
