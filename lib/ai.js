// Ai: the one way Notebooks asks a model, the one the person chose in
// Omabook's settings (`omabook.ai`), never with the AI off; every answer
// checked before anything is done with it. Whether that model is the
// person's own or someone else's is Omabook's to say (`ai.status`, #11).
var Ai = (function () {
    "use strict";

    const longest = 12000;

    // Whether the model may be asked: {available, hosted (someone else's
    // computer), why, message}. `hosted` false asks for the person's own alone.
    function status(hosted) { return Util.object(omabook.ai.status({hosted: hosted === true})); }

    // A promise of the model's answer as Markdown, cleaned as a text
    // block's words are (Typed): never HTML, never empty. `hosted` false
    // keeps it to the person's own computers: Omabook sends nothing else.
    function ask(prompt, system, hosted) {
        if (!omabook.ai.available())
            return Promise.reject(new Error("There is no AI to ask: it is off, or not set up, in Omabook's settings (AI). Nothing was sent."));
        return omabook.ai.ask(prompt, {system: system, hosted: hosted === true}).then(function (answer) {
            const text = Typed.clean(String(answer === null || answer === undefined ? "" : answer).slice(0, longest), "markdown").trim();
            if (!text)
                throw new Error("The AI answered nothing; ask again, or put the question another way.");
            return text;
        }, function (why) {
            throw new Error("The AI couldn't answer: " + (why && why.message ? why.message : String(why)));
        });
    }

    return {ask: ask, status: status};
})();
