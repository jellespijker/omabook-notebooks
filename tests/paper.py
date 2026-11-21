"""Every paper at every size: what it draws (Paper.layout, in millimetres) is
on the sheet, spaced as that paper is, and centred where it should be.
tests/run.py calls check() with its bench."""

SIZES = {"A4": (210, 297), "A5": (148, 210), "Letter": (215.9, 279.4)}
RULINGS = {"narrow": 6.35, "college": 7.1, "wide": 8.7}
CLOSE = 0.02


def near(a, b, within=CLOSE):
    return abs(a - b) <= within


def on_sheet(drawn, width, height):
    for line in drawn["lines"]:
        for x in (line["x1"], line["x2"]):
            assert -CLOSE <= x <= width + CLOSE, (drawn["title"], line)
        for y in (line["y1"], line["y2"]):
            assert -CLOSE <= y <= height + CLOSE, (drawn["title"], line)


def rows(drawn, role):
    return sorted(line["y1"] for line in drawn["lines"] if line["role"] == role and near(line["y1"], line["y2"]))


def steps(values):
    return [round(b - a, 2) for a, b in zip(values, values[1:], strict=False)]


def lined(drawn, width, height, ruling):
    ys = rows(drawn, "rule")
    assert all(near(step, RULINGS[ruling], 0.03) for step in steps(ys)), (drawn["title"], steps(ys))
    assert ys[0] > 0.05 * height and ys[-1] <= height * 0.97, (drawn["title"], ys[0], ys[-1])
    assert len(ys) >= (height * 0.85) // RULINGS[ruling], (drawn["title"], len(ys))
    margin = [line for line in drawn["lines"] if line["role"] == "margin"]
    assert len(margin) == 1 and near(margin[0]["x1"], width * 0.15, 0.01) and margin[0]["y2"] == height, margin


def grid(drawn, width, height):
    xs = sorted(line["x1"] for line in drawn["lines"] if near(line["x1"], line["x2"]))
    ys = sorted(line["y1"] for line in drawn["lines"] if near(line["y1"], line["y2"]))
    for values, length in ((xs, width), (ys, height)):
        assert all(near(step, 5) for step in steps(values)), (drawn["title"], steps(values))
        assert near(values[0], length - values[-1]), (drawn["title"], "centred", values[0], length - values[-1])
        assert values[0] < 5 and len(values) == int(length // 5) + 1, (drawn["title"], values[0], len(values))


def dotted(drawn, width, height):
    dots = drawn["dots"]
    assert drawn["lines"] == [] and dots["pitch"] == 5, drawn
    for start, count, length in ((dots["x"], dots["columns"], width), (dots["y"], dots["rows"], height)):
        end = start + (count - 1) * 5
        assert near(start, length - end) and start < 5 and end <= length, (drawn["title"], start, count)


def staves(drawn, width, height):
    ys = rows(drawn, "staff")
    assert len(ys) % 5 == 0 and len(ys) // 5 >= 8, (drawn["title"], len(ys))
    for at in range(0, len(ys), 5):
        assert steps(ys[at : at + 5]) == [2.0, 2.0, 2.0, 2.0], (drawn["title"], ys[at : at + 5])
        if at:
            assert near(ys[at] - ys[at - 1], 12), (drawn["title"], "between staves", ys[at] - ys[at - 1])
    assert near(ys[0], height - ys[-1]), (drawn["title"], "centred", ys[0], height - ys[-1])


def cornell(drawn, width, height):
    cue = [line for line in drawn["lines"] if line["role"] == "cue"]
    column = [line for line in cue if near(line["x1"], line["x2"])]
    across = sorted(line["y1"] for line in cue if near(line["y1"], line["y2"]))
    assert len(column) == 1 and near(column[0]["x1"], width * 0.3, 0.01), (drawn["title"], column)
    assert len(across) == 2 and near(across[1], height * 0.8, 0.01), (drawn["title"], across)
    assert near(column[0]["y1"], across[0]) and near(column[0]["y2"], across[1]), (drawn["title"], "the column runs from title to summary")
    ruled = rows(drawn, "rule")
    above = [y for y in ruled if y < across[1]]
    below = [y for y in ruled if y > across[1]]
    assert above and below and all(near(step, 7.1, 0.03) for step in steps(above) + steps(below)), (drawn["title"], ruled)


def check(bench, step):
    papers = bench.ok("papers")
    assert [kind["id"] for kind in papers["kinds"]] == ["lined", "squared", "dotted", "blank", "staves", "cornell"], papers
    assert papers["sizes"] == ["A4", "A5", "Letter"] and papers["rulings"] == ["narrow", "college", "wide"], papers
    for size, (width, height) in SIZES.items():
        for kind in ("lined", "squared", "dotted", "blank", "staves", "cornell"):
            for ruling in RULINGS if kind == "lined" else [None]:
                asked = {"kind": kind, "size": size} | ({"ruling": ruling} if ruling else {})
                drawn = bench.ok("paper", asked)
                assert drawn["paper"] == asked and drawn["width"] == width and drawn["height"] == height, drawn
                on_sheet(drawn, width, height)
                if kind == "lined":
                    lined(drawn, width, height, ruling)
                elif kind in ("squared", "dotted"):
                    (grid if kind == "squared" else dotted)(drawn, width, height)
                elif kind == "blank":
                    assert drawn["lines"] == [] and drawn["dots"] is None, drawn
                else:
                    (staves if kind == "staves" else cornell)(drawn, width, height)
    step("every paper (lined narrow, college and wide; squared; dotted; blank; staves; Cornell) draws right at A4, A5 and Letter")
    assert bench.ok("paper", {}) == bench.ok("paper", {"kind": "lined", "ruling": "college", "size": "A5"})
    assert "ruling" not in bench.ok("paper", {"kind": "squared", "ruling": "wide"})["paper"]
    step("a paper left unsaid is college-ruled A5, and a kind keeps only what it uses")
