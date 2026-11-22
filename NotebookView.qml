import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Omabook

// The view of notebooks (omabook.ui.view, "notebooks"): the notebooks and the
// loose notes on the left, the pages of the one chosen on the right, each on
// its paper. Narrow (beside the page, or a small window) it shows one of the
// two at a time, and Backspace goes from the pages back to the list. A page
// chosen is opened to write on (InkPage, #3), and Backspace or Escape goes
// back from it to the pages. An open page is the whole view (#14): the list,
// the paper pickers and the notebook's title fold away. A page's thumbnail
// shows its ink, text blocks and pictures.
// Over the list, words are found in every notebook (NotebookFind, #7).
// Under a notebook's title it is exported (NotebookExport) and asked about
// (NotebookAsk, #9).
//
// Beside a book (#8: Alt+N while reading, or the page's ⋯), the reader is
// on one side and this on the other: over the list, every page that refers
// to the book (BookReferences), each opening its page and the book at its
// passage; a page or a loose note made here refers to where the reader is.
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
    // What is open under the notebook's title (#9): "export", "ask" or "".
    property string tool: ""

    readonly property var shown: {
        if (chosen === "")
            return {id: "", title: "Loose notes", pages: overview.loose, loose: true}
        return overview.notebooks.find(function (one) { return one.id === chosen }) || null
    }

    readonly property bool writing: opened !== ""
    readonly property int openedAt: shown ? shown.pages.findIndex(function (one) { return one.id === opened }) : -1

    function reload() {
        overview = backend.scripts.call(plugin, "notebooks", []) || {notebooks: [], loose: []}
        if (beside) inBook.reload()
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
    onChosenChanged: { openPage(""); tool = "" }
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

    // Escape goes back from a page to the pages, rather than closing the view.
    Keys.onShortcutOverride: (event) => event.accepted = event.key === Qt.Key_Escape && view.writing
    Keys.onPressed: function (event) {
        if (event.key === Qt.Key_Escape && view.writing) {
            view.back()
            event.accepted = true
        } else if (event.key === Qt.Key_N && !(event.modifiers & Qt.ControlModifier) && view.shown && !view.shown.loose) {
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
        anchors.margins: view.writing ? 2 : view.narrow ? 8 : 16
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
            visible: !view.writing
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
                visible: !view.writing && (!view.narrow || view.chosen === null)
                Layout.fillHeight: true
                Layout.fillWidth: view.narrow
                Layout.preferredWidth: view.narrow ? -1 : 260
                spacing: 4

                // Beside a book: what refers to it; one chosen opens its page, and the book there.
                BookReferences {
                    id: inBook
                    Layout.fillWidth: true
                    visible: view.beside && reader.open && !finder.active
                    plugin: view.plugin
                    onGo: (one) => {
                        view.chosen = one.notebook
                        view.openPage(one.page)
                        if (one.here && !one.lost) backend.scripts.request(view.plugin, "followReference", [one.id, {anyway: true}])
                    }
                }
                // Words found in the notebooks; a hit opens its page, and plays what was said there.
                NotebookFind {
                    id: finder
                    Layout.fillWidth: true
                    Layout.fillHeight: active
                    plugin: view.plugin
                    onGo: (hit) => {
                        view.chosen = hit.loose ? "" : hit.notebook
                        view.openPage(hit.page)
                        if (hit.recording) backend.scripts.request(view.plugin, "play", [hit.recording, hit.at])
                    }
                }
                RowLayout {
                    visible: !finder.active
                    TextField { id: newTitle; Layout.fillWidth: true; placeholderText: "New notebook"
                                onAccepted: { view.ask("makeNotebook", [text, view.paperChosen()]); text = "" } }
                    Action { text: "Make"; onClicked: newTitle.accepted() }
                }
                ListView {
                    visible: !finder.active
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
                Action { visible: !finder.active; text: "New loose note"; onClicked: { view.ask("makeLooseNote", [view.paperChosen()]); view.chosen = "" } }
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
                        readOnly: !view.shown || !!view.shown.loose
                        text: view.shown ? view.shown.title : ""
                        font.pixelSize: 18
                        onAccepted: view.ask("renameNotebook", [view.shown.id, text])
                    }
                    Action { visible: view.shown && !view.shown.loose; text: "Add page (N)"
                             onClicked: view.ask("addPage", [view.shown.id, view.paperChosen()]) }
                    Action { visible: view.shown && !view.shown.loose && view.shown.book > 0; text: "Read"
                             onClicked: reader.openBook(view.shown.book) }
                    Action { text: "Export"; checkable: true; checked: view.tool === "export"
                             onClicked: view.tool = checked ? "export" : "" }
                    Action { visible: view.shown && !view.shown.loose; text: "Ask"; checkable: true; checked: view.tool === "ask"
                             onClicked: view.tool = checked ? "ask" : "" }
                    Action { visible: view.shown && !view.shown.loose; text: "Remove notebook"
                             onClicked: view.ask("removeNotebook", [view.shown.id]) }
                }
                Label {
                    visible: !!view.shown && !view.shown.loose && view.opened === ""
                    text: "Private: only on your own computers."
                    color: theme.colors.muted
                }

                NotebookExport {
                    Layout.fillWidth: true
                    visible: view.tool === "export"
                    plugin: view.plugin
                    notebook: view.shown
                    page: view.opened
                }
                NotebookAsk {
                    Layout.fillWidth: true
                    visible: view.tool === "ask" && !!view.shown && !view.shown.loose
                    plugin: view.plugin
                    notebook: view.shown
                    onChanged: view.reload()
                }

                // The page open, written on: the whole view.
                InkPage {
                    id: inkPage
                    visible: view.opened !== ""
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    plugin: view.plugin
                    entry: view.openedAt >= 0 ? view.shown.pages[view.openedAt] : null
                    hasBefore: view.openedAt > 0
                    loose: !!view.shown && !!view.shown.loose
                    hasAfter: view.openedAt >= 0 && view.openedAt < view.shown.pages.length - 1
                    where: view.openedAt >= 0 ? (view.shown.loose ? "note " : "page ") + (view.openedAt + 1) + " of "
                                                + view.shown.pages.length + " · " + view.shown.title : ""
                    onTurn: (by) => view.openPage(view.shown.pages[view.openedAt + by].id)
                    onBack: view.back()
                    onExportAsked: view.tool = view.tool === "export" ? "" : "export"
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
                            // Its text blocks and pictures (#4), read again whenever the overview is.
                            readonly property var held: {
                                view.overview
                                return backend.scripts.call(view.plugin, "content", [modelData.id]) || {typing: {step: 7.1}, items: []}
                            }
                            Repeater {
                                model: thumb.held.items.filter(function (one) { return one.layer === "below" })
                                delegate: ContentItem {
                                    required property var modelData
                                    item: modelData
                                    plugin: view.plugin
                                    unit: thumb.unit
                                    step: thumb.held.typing.step
                                }
                            }
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
                            Repeater {
                                model: thumb.held.items.filter(function (one) { return one.layer === "above" })
                                delegate: ContentItem {
                                    required property var modelData
                                    item: modelData
                                    plugin: view.plugin
                                    unit: thumb.unit
                                    step: thumb.held.typing.step
                                }
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
