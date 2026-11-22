import QtQuick

// A microphone for one of the view's text fields (#13): held while speaking,
// or pressed once to start and again to stop, by mouse, finger or pen, or
// Ctrl+M while the field has the keyboard; what is said goes in at the
// field's cursor. It is Omabook's (DictationMic), so it goes through speech
// to text as the person chose it, shows at the top of the window while it
// listens, and is never there with the AI Off; to a hosted service only with
// `hosted`, which a notebook says for its recordings (`speechHosted`). On an
// Omabook without dictation there is no microphone, and nothing else changes.
Loader {
    id: dictate

    property Item target: null
    property bool hosted: false
    // The field is in use: only then is the microphone there.
    property bool inUse: true
    // Omabook's microphone, once loaded (DictationMic).
    readonly property var mic: item
    readonly property bool shows: !!mic && mic.shows
    // It began to listen: the field may be opened for it, so the words, or
    // voxtype's typing of them, go there.
    signal started()
    // The words are about to go in: the field may need opening again first.
    signal hearing(string text)

    active: typeof backend !== "undefined" && !!backend.dictation
    source: "DictationMic.qml"
    visible: shows
    onLoaded: {
        mic.plugin = "Notebooks"
        mic.target = Qt.binding(function () { return dictate.target })
        mic.hosted = Qt.binding(function () { return dictate.hosted })
        mic.active = Qt.binding(function () { return dictate.inUse })
        mic.started.connect(dictate.started)
        mic.hearing.connect(dictate.hearing)
    }
}
