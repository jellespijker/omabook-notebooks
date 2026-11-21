// Prompts: every word Notebooks sends to a model, in one place to read.
//
// The model is asked only through Ai, and only about a notebook the person
// let it read (Asking): what is sent is the question, the notebook's own
// words, and of the books it refers to only what the person has read.
var Prompts = (function () {
    "use strict";

    const reader = "You are reading a person's own notebook with them: their typed notes, the words read from their "
        + "handwriting, what was said while they wrote, and the passages of books they referred to. Answer from the "
        + "notebook alone, plainly and briefly, in the language the question is asked in. Say which page an answer "
        + "comes from (\"page 3\"). When the notebook doesn't say, say so; never guess, and never tell what happens "
        + "in a book beyond the passages given. Answer in Markdown, without HTML.";

    const summary = "Summarise this notebook: what it is about, and the main points of its pages, a line each.";

    // The question, or a summary when there is none, with the notebook's words under it.
    function question(asked, title, context) {
        return (Util.text(asked) || summary) + "\n\n--- The notebook \"" + title + "\" ---\n\n" + context;
    }

    return {reader: reader, question: question};
})();
