import QtQuick
import Omabook

// Omabook's own microphone for a text field (jellespijker/omabook#148,
// Omabook 0.4.0), as Dictate loads it: only where Omabook has dictation, for
// an older Omabook has no DictationButton and this file wouldn't load there.
DictationButton {
    id: mic
    // Whether it is shown: `visible` itself is false too while what holds it is hidden.
    readonly property bool shows: mic.active && mic.status.why !== undefined && mic.status.why !== "ai-off"
}
