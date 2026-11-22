// Ai: the one way Notebooks asks a model, the one the person chose in
// Omabook's settings (`omabook.ai`), never with the AI off; every answer
// checked before anything is done with it. Whether that model is the
// person's own or someone else's is Omabook's to say (`ai.status`, #11).
// Where a capability's server lacks its model, Omabook can find one there or
// download one onto it (`ai.remedy`, jellespijker/omabook#172), when the
// person presses for it.
var Ai = (function () {
    "use strict";

    const longest = 12000;

    // Whether the model may be asked: {available, hosted (someone else's
    // computer), why, message}. `hosted` false asks for the person's own alone.
    function status(hosted) { return Util.object(omabook.ai.status({hosted: hosted === true})); }

    // Whether speech to text may be asked, as Omabook says it: {available,
    // why, message}; a hosted way only with `hosted` (jellespijker/omabook#146).
    // An Omabook before 0.3.0 has no capabilities in `ai.status`, and answers
    // for its answers instead: its recognition status says it then.
    function speech(hosted) {
        const found = Util.object(omabook.ai.status({capability: "speech-to-text", hosted: hosted === true}));
        return found.capability === "speech-to-text" ? found : Util.object(omabook.recognize.status("audio", {hosted: hosted === true}));
    }

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

    // What is being done for a capability's missing model, 0 to 1, by capability.
    const mending = {};

    // Whether the capability's model is missing, as Omabook 0.4.0 says it,
    // and what it offers to do about it ({} until it has looked).
    function missing(capability, hosted) {
        if (typeof omabook.ai.remedy !== "function")
            return {missing: false, offered: {}};
        const found = Util.object(omabook.ai.status({capability: capability, hosted: hosted === true}));
        return {missing: found.why === "no-model", offered: Util.object(found.remedy)};
    }

    function offerOf(lack) {
        const offered = lack.offered;
        if (!lack.missing || (offered.action !== "use" && offered.action !== "download"))
            return null;
        return {action: offered.action, model: Util.text(offered.model), size: Number(offered.size) || 0,
                server: Util.text(offered.server)};
    }

    // What Omabook can do about a capability ("handwriting", "speech-to-text")
    // whose model its server lacks: {action ("use" a model already there, or
    // "download" one), model, size (bytes), server}; null when its model isn't
    // missing, nothing can be done, or the server hasn't been looked at yet
    // (the first asking starts that). Null on an Omabook before 0.4.0, which
    // has no `ai.remedy`: what it says stays as it was.
    function remedy(capability, hosted) { return offerOf(missing(capability, hosted)); }

    // A promise of remedy(), once Omabook has looked at the server: it is
    // asked again a few times, a moment apart, so a failure is said with
    // what can be done about it. At once where its model isn't missing.
    function remedyFound(capability, hosted) {
        return new Promise(function (resolve) {
            function look(left) {
                const lack = missing(capability, hosted);
                const offered = offerOf(lack);
                if (offered || !lack.missing || left === 0)
                    resolve(offered);
                else
                    omabook.after(250, function () { look(left - 1); });
            }
            look(20);
        });
    }

    // Does what remedy() offers, for the person who pressed for it: a
    // promise of the model chosen; how far a download is, as mendedSoFar says.
    function mend(capability) {
        if (typeof omabook.ai.remedy !== "function")
            return Promise.reject(new Error("This Omabook can't find a model for you; choose one in its settings (AI)."));
        mending[capability] = 0;
        return omabook.ai.remedy({capability: capability, onProgress: function (done) { mending[capability] = Number(done) || 0; }})
            .then(function (model) {
                delete mending[capability];
                return Util.text(model);
            }, function (why) {
                delete mending[capability];
                throw new Error(why && why.message ? why.message : String(why));
            });
    }

    // How far mend() is for a capability, 0 to 1, or -1 when it isn't under way.
    function mendedSoFar(capability) { return mending[capability] === undefined ? -1 : mending[capability]; }

    return {ask: ask, status: status, speech: speech, remedy: remedy, remedyFound: remedyFound, mend: mend,
            mendedSoFar: mendedSoFar};
})();
