import QtQuick

// What is on a page but its ink (#4): its text blocks and pictures as the
// script lists them (`content()`), the one chosen and the one being typed
// in, and what is done to them, asked of the script. The page (InkPage)
// draws them, a ContentItem each, below the ink and above it, and hands
// this its keys while the Type tool is chosen (keys()); a picture comes
// through PictureImport, picked or dropped.
//
// What is moved, typed or removed is shown at once, before the script has
// kept it, and read again from the script when it answers; a reason it
// could not be kept is said (`problem`) and what is kept shown again.
Item {
    id: here

    property string plugin: ""
    property string pageId: ""
    readonly property var empty: ({typing: {top: 0, step: 7.1, left: 0}, items: []})
    property var content: empty
    property string chosen: ""
    property string editing: ""
    readonly property var chosenItem: content.items.find(function (one) { return one.id === here.chosen }) || null
    // The writes asked of the script and not answered yet.
    property var asked: ({})

    signal problem(string why)
    // Typing is done, so the page takes the keyboard back.
    signal doneTyping()
    // A picture was added: the page goes to the Type tool, where it can be moved.
    signal pictureAdded()

    onPageIdChanged: { editing = ""; chosen = ""; content = empty; reload() }

    function ask(fn, args) {
        const id = backend.scripts.request(plugin, fn, args)
        const next = Object.assign({}, asked)
        next[id] = true
        asked = next
    }
    function lying(kind) { return content.items.filter(function (one) { return one.layer === kind }) }

    Connections {
        target: backend.scripts
        function onAnswered(id, result, error) {
            if (!here.asked[id]) return
            const left = Object.assign({}, here.asked)
            delete left[id]
            here.asked = left
            if (error) here.problem(error.replace(/^.*?Error: /, ""))
            here.reload()
        }
    }

    // Not while typing: the block typed in would be made anew, and its words with it.
    function reload() {
        if (pageId === "" || editing !== "") return
        content = backend.scripts.call(plugin, "content", [pageId]) || empty
        if (chosen !== "" && !chosenItem) chosen = ""
    }
    // Shown as asked before the script has it, so a block dropped stays where it was dropped.
    function changeLocally(id, fields) {
        content = {typing: content.typing, items: content.items.map(function (one) {
            return one.id === id ? Object.assign({}, one, fields) : one
        })}
    }
    function placeItem(id, rectangle) {
        changeLocally(id, rectangle)
        ask("place", [id, rectangle])
    }
    function arrange(how) { if (chosen !== "") ask("arrange", [chosen, how]) }
    function removeChosen() {
        if (chosen === "") return
        ask("removeContent", [chosen])
        content = {typing: content.typing, items: content.items.filter(function (one) { return one.id !== here.chosen })}
        chosen = ""
    }
    // A new text block, at a place on the page in millimetres or below the others, typed in at once.
    function newText(at) {
        const id = backend.scripts.call(plugin, "addText", [pageId, at || {}])
        if (!id) return
        reload()
        chosen = id
        editing = id
    }
    function editChosen() {
        if (chosenItem && chosenItem.kind === "text") editing = chosen
        else if (!chosenItem) newText(null)
    }
    function typed(id, text, needs) {
        if (editing !== id) return
        editing = ""
        const one = content.items.find(function (item) { return item.id === id })
        if (one && text.trim() === "") {
            // Nothing typed: no block left behind with nothing in it.
            chosen = id
            removeChosen()
        } else if (one && one.text !== text) {
            changeLocally(id, {text: text})
            ask("changeText", [id, {text: text}])
        }
        if (one && text.trim() !== "" && needs > one.height + 0.01) placeItem(id, {height: needs})
        doneTyping()
    }
    // The next one (1) or the one before (-1), in the order they lie on the page.
    function chooseNext(by) {
        const all = content.items
        if (!all.length) return
        const at = all.findIndex(function (one) { return one.id === here.chosen })
        const from = at >= 0 ? at : (by > 0 ? -1 : all.length)
        chosen = all[(from + by + all.length) % all.length].id
    }
    // Arrows: moved a millimetre (Shift: a line), or with Alt made smaller or larger.
    function nudge(dx, dy, shift, alt) {
        const one = chosenItem
        if (!one) return
        const by = shift ? content.typing.step : 1
        if (alt) {
            const width = Math.max(5, one.width + dx * by)
            placeItem(one.id, {width: width, height: one.kind === "text" ? Math.max(content.typing.step, one.height + dy * content.typing.step)
                                                                         : width * one.height / one.width})
        } else {
            placeItem(one.id, {x: one.x + dx * by, y: one.y + dy * (one.kind === "text" ? content.typing.step : by)})
        }
    }
    function toggleFormat() {
        if (chosenItem && chosenItem.kind === "text")
            ask("changeText", [chosen, {format: chosenItem.format === "plain" ? "markdown" : "plain"}])
    }
    function hit(at) {
        return content.items.some(function (one) {
            return at.x >= one.x && at.x <= one.x + one.width && at.y >= one.y && at.y <= one.y + one.height
        })
    }
    // A picture from a file: picked, or dropped at a place on the page (in millimetres).
    function pickPicture() { importer.pick(null) }
    function takePicture(url, at) { importer.take(url, at) }

    // The keys of the Type tool, for the event pressed.
    function keys(event) {
        const shift = !!(event.modifiers & Qt.ShiftModifier)
        const alt = !!(event.modifiers & Qt.AltModifier)
        const keys = {}
        keys[Qt.Key_Tab] = function () { here.chooseNext(1) }
        keys[Qt.Key_Backtab] = function () { here.chooseNext(-1) }
        keys[Qt.Key_Return] = here.editChosen
        keys[Qt.Key_Enter] = here.editChosen
        keys[Qt.Key_Delete] = here.removeChosen
        // L is the lasso's, but for one chosen: above or below the ink.
        if (here.chosenItem)
            keys[Qt.Key_L] = function () { here.arrange(here.chosenItem.layer === "above" ? "below" : "above") }
        keys[Qt.Key_M] = here.toggleFormat
        keys[Qt.Key_Left] = function () { here.nudge(-1, 0, shift, alt) }
        keys[Qt.Key_Right] = function () { here.nudge(1, 0, shift, alt) }
        keys[Qt.Key_Up] = function () { here.nudge(0, -1, shift, alt) }
        keys[Qt.Key_Down] = function () { here.nudge(0, 1, shift, alt) }
        return keys
    }

    PictureImport {
        id: importer
        plugin: here.plugin
        onReady: (data, width, height, title, at) => {
            if (here.pageId === "") return
            const details = {data: data, pixels: {width: width, height: height}, title: title}
            if (at) { details.x = at.x; details.y = at.y }
            here.pictureAdded()
            here.ask("addPicture", [here.pageId, details])
        }
        onFailed: (why) => here.problem(why)
    }
}
