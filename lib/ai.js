// Ai: the one way Notebooks asks a model, the one the person chose in
// Omabook's settings (`omabook.ai`), never with the AI off; every answer
// checked before anything is done with it.
var Ai = (function () {
    "use strict";

    const longest = 12000;

    // A promise of the model's answer as Markdown, cleaned as a text
    // block's words are (Typed): never HTML, never empty.
    function ask(prompt, system) {
        if (!omabook.ai.available())
            return Promise.reject(new Error("There is no AI to ask: it is off, or not set up, in Omabook's settings (AI). Nothing was sent."));
        return omabook.ai.ask(prompt, {system: system}).then(function (answer) {
            const text = Typed.clean(String(answer === null || answer === undefined ? "" : answer).slice(0, longest), "markdown").trim();
            if (!text)
                throw new Error("The AI answered nothing; ask again, or put the question another way.");
            return text;
        }, function (why) {
            throw new Error("The AI couldn't answer: " + (why && why.message ? why.message : String(why)));
        });
    }

    return {ask: ask};
})();
