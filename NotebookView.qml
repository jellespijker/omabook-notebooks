import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Omabook

// The view of notebooks (omabook.ui.view, "notebooks"): the notebooks and the
// loose notes on the left, the pages of the one chosen on the right, each on
// its paper. Narrow (beside the page, or a small window) it shows one of the
// two at a time, and Backspace goes from the pages back to the list. A page
// chosen is opened to write on (InkPage, #3), and Backspace goes back from
// it to the pages.
//
// It holds no logic of its own: what it shows comes from the script
// (`notebooks()`, `paper()`), and what is done is asked of it. A call that
// changes something goes through `request`, so a reason it can't be done
// comes back and is shown under the header.
//
// The words here are plain English and not translated: a plugin has no
// translation catalog.
FocusScope {
    id: view

    // Set by Omabook: beside the page or not, and what showView was given.
    property bool beside: false
    property var args: ({})

    // This plugin's name is its folder's, chosen when it is installed, so the
    // view looks for the value that says it is Notebooks' (Shelf.publish).
    readonly property string plugin: {
        const all = backend.scripts.data
        for (const name in all)
            if (all[name] && all[name].view && all[name].view.notebooks)
                return name
        return "notebooks"
    }
    readonly property bool narrow: beside || width < 640

    property var overview: ({notebooks: [], loose: []})
    property var choices: ({kinds: [], rulings: [], sizes: []})
    // The notebook shown: its id, "" for the loose notes, null for none.
    property var chosen: null
    // The page open to write on, by its id; "" for none.
    property string opened: ""
    property string problem: ""
    property int asked: -1

    readonly property var shown: {
        if (chosen === "")
            return {id: "", title: "Loose notes", pages: overview.loose, loose: true}
        return overview.notebooks.find(function (one) { return one.id === chosen }) || null
    }

    readonly property int openedAt: shown ? shown.pages.findIndex(function (one) { return one.id === opened }) : -1

    function reload() {
        overview = backend.scripts.call(plugin, "notebooks", []) || {notebooks: [], loose: []}
        if (chosen && !shown)
            chosen = null
        if (opened !== "" && openedAt < 0)
            opened = ""
    }
    // Opens a page to write on, "" for none; the one open before is left first.
    function openPage(id) {
        if (opened === id) return
        if (opened !== "") inkPage.leave()
        opened = id
        if (id !== "") inkPage.takeFocus()
        else view.forceActiveFocus()
    }
    function ask(fn, args) {
        problem = ""
        asked = backend.scripts.request(plugin, fn, args)
    }
    function paperChosen() {
        const kind = choices.kinds[kindBox.currentIndex] ? choices.kinds[kindBox.currentIndex].id : "lined"
        return {kind: kind, ruling: choices.rulings[rulingBox.currentIndex], size: choices.sizes[sizeBox.currentIndex]}
    }
    function back() {
        if (opened !== "") {
            openPage("")
            reload()
            return true
        }
        if (narrow && chosen !== null) {
            chosen = null
            return true
        }
        return false
    }
    function takeFocus() {
        if (opened !== "") {
            // Written on elsewhere meanwhile, perhaps (a sync).
            inkPage.reload()
            inkPage.takeFocus()
        } else {
            forceActiveFocus()
        }
    }
    onChosenChanged: openPage("")
    Component.onDestruction: if (opened !== "") inkPage.leave()
    onVisibleChanged: if (!visible && opened !== "") inkPage.leave()

    Component.onCompleted: {
        choices = backend.scripts.call(plugin, "papers", []) || choices
        reload()
        if (args && args.notebook)
            chosen = args.notebook
    }
    onArgsChanged: if (args && args.notebook) { reload(); chosen = args.notebook }

    Connections {
        target: backend.scripts
        function onAnswered(id, result, error) {
            if (id !== view.asked) return
            view.asked = -1
            view.problem = (error || "").replace(/^.*?Error: /, "")
            if (!error && result && result.notebook)
                view.chosen = result.notebook
            view.reload()
        }
    }

    Keys.onPressed: function (event) {
        if (event.key === Qt.Key_N && !(event.modifiers & Qt.ControlModifier) && view.shown && !view.shown.loose) {
            view.ask("addPage", [view.shown.id, view.paperChosen()])
            event.accepted = true
        } else if (event.key === Qt.Key_Return && view.opened === "" && view.shown && view.shown.pages.length > 0) {
            // The keyboard's way to a page: the first, then Page Down.
            view.openPage(view.shown.pages[0].id)
            event.accepted = true
        }
    }

    component Action: Button {
        flat: true
        font.pixelSize: 13
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: view.narrow ? 8 : 16
        spacing: 8

        Label {
            Layout.fillWidth: true
            visible: view.problem !== ""
            text: view.problem
            color: theme.colors.red || theme.accent
            wrapMode: Text.Wrap
        }

        // What a new page is printed with.
        RowLayout {
            Layout.fillWidth: true
            spacing: 6
            ComboBox { id: kindBox; model: view.choices.kinds.map(function (k) { return k.title }) }
            ComboBox {
                id: rulingBox
                visible: kindBox.currentIndex === 0
                model: view.choices.rulings
                currentIndex: Math.max(0, view.choices.rulings.indexOf("college"))
            }
            ComboBox { id: sizeBox; model: view.choices.sizes; currentIndex: Math.max(0, view.choices.sizes.indexOf("A5")) }
            Item { Layout.fillWidth: true }
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 16

            // The notebooks and the loose notes.
            ColumnLayout {
                visible: !view.narrow || view.chosen === null
                Layout.fillHeight: true
                Layout.fillWidth: view.narrow
                Layout.preferredWidth: view.narrow ? -1 : 260
                spacing: 4

                RowLayout {
                    TextField { id: newTitle; Layout.fillWidth: true; placeholderText: "New notebook"
                                onAccepted: { view.ask("makeNotebook", [text, view.paperChosen()]); text = "" } }
                    Action { text: "Make"; onClicked: newTitle.accepted() }
                }
                ListView {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    model: view.overview.notebooks.concat([{id: "", title: "Loose notes", pages: view.overview.loose, loose: true}])
                    delegate: ItemDelegate {
                        required property var modelData
                        width: ListView.view.width
                        highlighted: view.chosen === modelData.id
                        text: modelData.title + "  ·  " + modelData.pages.length + (modelData.pages.length === 1 ? " page" : " pages")
                        onClicked: view.chosen = modelData.id
                    }
                }
                Action { text: "New loose note"; onClicked: { view.ask("makeLooseNote", [view.paperChosen()]); view.chosen = "" } }
            }

            // The pages of the one chosen.
            ColumnLayout {
                visible: view.shown !== null
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: 6

                RowLayout {
                    Layout.fillWidth: true
                    visible: view.opened === ""
                    TextField {
                        Layout.fillWidth: true
                        readOnly: !view.shown || view.shown.loose
                        text: view.shown ? view.shown.title : ""
                        font.pixelSize: 18
                        onAccepted: view.ask("renameNotebook", [view.shown.id, text])
                    }
                    Action { visible: view.shown && !view.shown.loose; text: "Add page (N)"
                             onClicked: view.ask("addPage", [view.shown.id, view.paperChosen()]) }
                    Action { visible: view.shown && !view.shown.loose && view.shown.book > 0; text: "Read"
                             onClicked: reader.openBook(view.shown.book) }
                    Action { visible: view.shown && !view.shown.loose; text: "Remove notebook"
                             onClicked: view.ask("removeNotebook", [view.shown.id]) }
                }
                Label {
                    visible: !!view.shown && !view.shown.loose && view.opened === ""
                    text: "Private: only on your own computers."
                    color: theme.colors.muted
                }

                // The page open, written on.
                RowLayout {
                    Layout.fillWidth: true
                    visible: view.opened !== ""
                    Action { text: "← Pages"; onClicked: view.back() }
                    Label {
                        Layout.fillWidth: true
                        text: view.openedAt >= 0 ? (view.shown.loose ? "Note " : "Page ") + (view.openedAt + 1) + " of "
                                                   + view.shown.pages.length + "  ·  " + view.shown.title : ""
                        elide: Text.ElideRight
                        color: theme.colors.muted
                    }
                }
                InkPage {
                    id: inkPage
                    visible: view.opened !== ""
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    plugin: view.plugin
                    entry: view.openedAt >= 0 ? view.shown.pages[view.openedAt] : null
                    hasBefore: view.openedAt > 0
                    hasAfter: view.openedAt >= 0 && view.openedAt < view.shown.pages.length - 1
                    onTurn: (by) => view.openPage(view.shown.pages[view.openedAt + by].id)
                }

                GridView {
                    id: grid
                    visible: view.opened === ""
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    cellWidth: view.narrow ? width : 200
                    cellHeight: cellWidth * 1.42 + 70
                    model: view.shown ? view.shown.pages : []
                    delegate: Column {
                        required property var modelData
                        required property int index
                        width: grid.cellWidth - 12
                        spacing: 2
                        // The page with its ink, small; a click or a tap opens it to write on.
                        PaperSheet {
                            id: thumb
                            width: parent.width
                            height: implicitHeight
                            plugin: view.plugin
                            paper: modelData.paper
                            InkSurface {
                                anchors.fill: parent
                                readOnly: true
                                inkScale: thumb.unit
                                // Read again whenever the overview is, as on coming back from the page.
                                readonly property var kept: {
                                    view.overview
                                    return backend.scripts.call(view.plugin, "strokes", [modelData.id]) || {}
                                }
                                onKeptChanged: load(kept)
                                Component.onCompleted: load(kept)
                            }
                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: view.openPage(modelData.id)
                            }
                            Accessible.role: Accessible.Button
                            Accessible.name: "Open " + (view.shown.loose ? "note " : "page ") + modelData.number + " to write on"
                        }
                        Label { text: (view.shown.loose ? "Note " : "Page ") + modelData.number + "  ·  " + modelData.title
                                color: theme.colors.muted; font.pixelSize: 11; width: parent.width; elide: Text.ElideRight }
                        Flow {
                            width: parent.width
                            Action { text: "←"; visible: !view.shown.loose && index > 0
                                     onClicked: view.ask("movePage", [modelData.id, index - 1]) }
                            Action { text: "→"; visible: !view.shown.loose && index < view.shown.pages.length - 1
                                     onClicked: view.ask("movePage", [modelData.id, index + 1]) }
                            Action { text: "Paper"; onClicked: view.ask("setPaper", [modelData.id, view.paperChosen()]) }
                            Action { text: "Remove"; onClicked: view.ask("removePage", [modelData.id]) }
                            ComboBox {
                                visible: view.overview.notebooks.length > 0
                                displayText: view.shown.loose ? "File into…" : "Move to…"
                                model: view.overview.notebooks.map(function (n) { return n.title }).concat(["Loose notes"])
                                onActivated: function (at) {
                                    const target = at < view.overview.notebooks.length ? view.overview.notebooks[at].id : ""
                                    view.ask("filePage", [modelData.id, target])
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
