pragma ComponentBehavior: Bound
import QtQuick

// What lies below a page's ink, or above it (#4), lowest first: a
// ContentItem each, chosen, moved, resized and typed in with the Type tool,
// as the page's PageContent says. The chosen text block's field is the one
// the rail's microphone says into (#13).
Item {
    id: lying

    required property InkPage page
    required property string kind
    property real unit: 1
    readonly property PageContent content: page.items

    anchors.fill: parent

    Repeater {
        model: lying.content.lying(lying.kind)
        delegate: ContentItem {
            required property var modelData
            item: modelData
            plugin: lying.page.plugin
            unit: lying.unit
            step: lying.content.content.typing.step
            arranging: lying.page.tool === "type"
            chosen: lying.content.chosen === item.id
            editing: lying.content.editing === item.id
            onChosenChanged: if (chosen && isText) lying.content.chosenField = field
            Component.onCompleted: if (chosen && isText) lying.content.chosenField = field
            onChoose: { lying.content.chosen = item.id; if (lying.content.editing !== item.id) lying.page.takeFocus() }
            onEdit: { lying.content.chosen = item.id; lying.content.editing = item.id }
            onPlaced: (rectangle) => lying.content.placeItem(item.id, rectangle)
            onTyped: (text, needs) => lying.content.typed(item.id, text, needs)
        }
    }
}
