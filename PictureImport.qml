import QtQuick
import QtQuick.Dialogs

// Reads a picture from a file for a page (#4): picked (pick()), or dropped
// on the page (take(url)). It is scaled to at most `side` pixels a side and
// written again, as PNG when it came as one (it may be see-through) and as
// JPEG otherwise or when the PNG is over `bytes`, which also leaves out what
// the file said of where it was taken. The script keeps the result (`ready`)
// in the change log, so it goes to the person's other computers; a plugin
// has no way to copy a file of the person's itself (see Pictures).
Item {
    id: importer

    property string plugin: ""
    readonly property var limits: plugin === "" ? ({bytes: 1048576, side: 1600})
                                                : (backend.scripts.call(plugin, "pictureLimits", []) || {bytes: 1048576, side: 1600})
    // Where on the page it was asked for, in millimetres; null for the page to choose.
    property var at: null
    property string title: ""

    signal ready(string data, int width, int height, string title, var at)
    signal failed(string why)

    width: 1
    height: 1

    function pick(where) {
        at = where || null
        dialog.open()
    }
    function take(url, where) {
        at = where || null
        const name = decodeURIComponent(String(url).replace(/^.*\//, ""))
        if (!/\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(name)) {
            failed("\"" + name + "\" isn't a picture that can be put on a page: PNG, JPEG, GIF, WebP, BMP or TIFF.")
            return
        }
        title = name
        reading.source = ""
        reading.source = url
    }

    FileDialog {
        id: dialog
        title: "Put a picture on the page"
        nameFilters: ["Pictures (*.png *.jpg *.jpeg *.gif *.webp *.bmp *.tif *.tiff)"]
        onAccepted: importer.take(selectedFile, importer.at)
    }

    Image {
        id: reading
        visible: false
        asynchronous: true
        autoTransform: true
        sourceSize.width: importer.limits.side
        sourceSize.height: importer.limits.side
        onStatusChanged: {
            if (status === Image.Error) {
                importer.failed("\"" + importer.title + "\" can't be read as a picture.")
            } else if (status === Image.Ready) {
                canvas.width = implicitWidth
                canvas.height = implicitHeight
                canvas.loadImage(source)
            }
        }
    }

    // Draws the picture once, read back as PNG or JPEG. It is never seen.
    Canvas {
        id: canvas
        opacity: 0
        onImageLoaded: requestPaint()
        onPaint: {
            const source = reading.source
            if (!isImageLoaded(source)) return
            const g = getContext("2d")
            g.clearRect(0, 0, width, height)
            g.drawImage(source, 0, 0, width, height)
            unloadImage(source)
            // Base64 is a third longer than the bytes it holds.
            const most = importer.limits.bytes * 4 / 3 + 64
            let data = /\.png$/i.test(importer.title) ? toDataURL("image/png") : ""
            if (data === "" || data.length > most)
                data = toDataURL("image/jpeg")
            if (data.length > most)
                importer.failed("\"" + importer.title + "\" is too large for a page even when made smaller.")
            else
                importer.ready(data, width, height, importer.title, importer.at)
            reading.source = ""
        }
    }
}
