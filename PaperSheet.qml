import QtQuick

// A page's paper, drawn from what the script says it holds in millimetres
// (`paper()`), scaled to the width it is given. Paper is paper in a light
// theme and a dark one alike, a sheet on the desk: ink keeps the colour it
// was written in (#3), so the sheet under it keeps its own colours too.
Canvas {
    id: sheet
    // The plugin's name, to ask the script (NotebookView.plugin).
    property string plugin: ""
    property var paper: ({})
    readonly property var layout: plugin === "" ? fallback : (backend.scripts.call(plugin, "paper", [paper]) || fallback)
    readonly property var fallback: ({width: 148, height: 210, lines: []})
    // Pixels to a millimetre at the width it has.
    readonly property real unit: width / layout.width
    implicitHeight: width * layout.height / layout.width
    onLayoutChanged: requestPaint()
    onWidthChanged: requestPaint()

    readonly property var colours: ({paper: "#fdfcf8", rule: "#b4c0d0", grid: "#d4dae4", staff: "#5a5a5a",
                                     margin: "#d98c8c", cue: "#d98c8c", dot: "#9aa3b0"})

    onPaint: {
        const g = getContext("2d")
        const scale = unit
        g.reset()
        g.fillStyle = colours.paper
        g.fillRect(0, 0, width, height)
        for (const l of layout.lines) {
            g.strokeStyle = colours[l.role] || colours.rule
            g.lineWidth = Math.max(0.5, (l.role === "staff" ? 0.15 : 0.1) * scale)
            g.beginPath()
            g.moveTo(l.x1 * scale, l.y1 * scale)
            g.lineTo(l.x2 * scale, l.y2 * scale)
            g.stroke()
        }
        const d = layout.dots
        if (d) {
            g.fillStyle = colours.dot
            const r = Math.max(0.6, 0.25 * scale)
            for (let i = 0; i < d.columns; i++)
                for (let j = 0; j < d.rows; j++)
                    g.fillRect((d.x + i * d.pitch) * scale - r / 2, (d.y + j * d.pitch) * scale - r / 2, r, r)
        }
    }
}
