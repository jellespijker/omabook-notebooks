"""Shapes and the ruler (#10): a rough line, arrow, circle or polygon drawn in one stroke made
neat, a line drawn beside the ruler laid on its edge, and writing left as it was written.

The view asks `neaten()` for what the pen just drew; here the strokes are ones the surface could
have sent (strokes.py), and what comes back is read with the same codec, kept as ink, and read by
Omabook itself (recognition, against the stand-in server). tests/run.py calls check().
"""

import math

import strokes
from fakeserver import FakeServer
from recognition import serve


def ring(cx, cy, rx, ry, turned=0.0):
    """Corners going round an ellipse, a little past where it began, as a hand does."""
    out = []
    for i in range(61):
        t = 0.3 + 1.02 * 2 * math.pi * i / 60
        grow = 1 + 0.03 * math.sin(3 * t)
        x, y = rx * grow * math.cos(t), ry * grow * math.sin(t)
        cos, sin = math.cos(turned), math.sin(turned)
        out.append((cx + x * cos - y * sin, cy + x * sin + y * cos))
    return out


def near(a, b, within=1.6):
    return math.dist(a[:2], b[:2]) <= within


def neatened(bench, drawn, **options):
    batch = strokes.batch(drawn)
    (key,) = batch["add"]
    answered = bench.ok("neaten", batch["add"], options or {"shapes": True})
    return strokes.decode(answered[key]) if answered else None


def lines(bench, step):
    drawn = strokes.through([(20, 40), (80, 41.5)], colour=0xFF2F5FB3, width=0.8)
    made, was = neatened(bench, drawn), strokes.decode(drawn)
    assert made, "a rough line is a line"
    ys = {y for _, y, _, _ in made["points"]}
    assert len(ys) == 1 and near(made["points"][0], (20, 40)) and near(made["points"][-1], (80, 40)), ys
    assert (made["colour"], made["width"], made["began"], made["flags"]) == (was["colour"], was["width"], was["began"], was["flags"])
    pressures = {pressure for _, _, pressure, _ in made["points"]}
    assert len(pressures) == 1 and 0.4 <= pressures.pop() <= 0.6 and made["points"][-1][3] == was["points"][-1][3]
    slanted = neatened(bench, strokes.through([(20, 40), (60, 70)]))
    assert near(slanted["points"][0], (20, 40)) and near(slanted["points"][-1], (60, 70))
    assert all(abs((y - 40) - (x - 20) * 0.75) < 0.8 for x, y, _, _ in slanted["points"]), "straight between its ends"
    step("a rough line is drawn straight, level where it nearly is, with its colour, width, moment and the pen's average pressure")


def arrows(bench, step):
    head = [(20, 100), (80, 100), (72, 95), (80, 100), (72, 105.5)]
    for corners in (head, [(20, 100), (80, 100), (71, 94), (80, 100.5), (72, 106), (80, 100)]):
        arrow = neatened(bench, strokes.through(corners))
        assert arrow, "an arrow is an arrow"
        points = arrow["points"]
        assert near(points[0], (20, 100)) and all(any(near(p, tip, 2) for p in points) for tip in [(80, 100), (73, 96), (73, 104)])
        assert all(abs(y - 100) < 0.5 for x, y, _, _ in points if x < 70), "its shaft is straight"
    step("a rough arrow, drawn in one stroke, gets a straight shaft and a head alike on both sides")
    for corners in ([(20, 100), (80, 100), (72, 95)], [(20, 100), (50, 130), (80, 100)]):
        assert neatened(bench, strokes.through(corners)) is None, corners


def round_shapes(bench, step):
    circle = neatened(bench, strokes.through(ring(70, 60, 21, 19)))
    radii = [math.dist((x, y), (70, 60)) for x, y, _, _ in circle["points"]]
    assert max(radii) - min(radii) < 2 and 18.5 < sum(radii) / len(radii) < 21.5, (min(radii), max(radii))
    oval = neatened(bench, strokes.through(ring(70, 60, 35, 14)))
    assert all(abs(math.hypot((x - 70) / 35, (y - 60) / 14) - 1) < 0.09 for x, y, _, _ in oval["points"])
    leaning = neatened(bench, strokes.through(ring(70, 80, 35, 12, turned=0.6)))
    far = max(leaning["points"], key=lambda p: math.dist(p[:2], (70, 80)))
    assert abs(math.atan((far[1] - 80) / (far[0] - 70)) - 0.6) < 0.1, "an ellipse keeps its lean"
    assert near(circle["points"][0], circle["points"][-1], 0.2), "closed"
    step("a rough circle is drawn round, a rough ellipse as an ellipse, upright or leaning, closed")


def polygons(bench, step):
    # Begun in the middle of a side, as boxes often are.
    box = neatened(bench, strokes.through([(50, 30), (90, 31), (89, 61), (29, 60), (30.5, 30), (51, 30.5)]))
    xs = {x for x, _, _, _ in box["points"]}
    ys = {y for _, y, _, _ in box["points"]}
    assert abs(min(xs) - 30) < 1.5 and abs(max(xs) - 89.5) < 1.5 and abs(min(ys) - 30) < 1.5 and abs(max(ys) - 60.5) < 1.5
    assert all(x in (min(xs), max(xs)) or y in (min(ys), max(ys)) for x, y, _, _ in box["points"]), "four straight, level sides"
    corners = [(60, 40), (88, 68), (60, 96), (32, 68), (60, 40)]
    diamond = neatened(bench, strokes.through(corners))
    assert all(any(near(p, corner) for p in diamond["points"]) for corner in corners), "a turned square keeps its turn"
    step("rough rectangles, level or turned and begun anywhere on them, are drawn with straight sides and sharp corners")


def triangles(bench, step):
    corners = [(60, 30), (90, 80), (30, 80), (60, 30)]
    triangle = neatened(bench, strokes.through(corners))
    assert all(any(near(p, corner) for p in triangle["points"]) for corner in corners)
    off = [abs(y - 80) for x, y, _, _ in triangle["points"] if y > 78 and 34 < x < 86]
    assert off and max(off) < 1, "its sides are straight"
    step("a rough triangle is drawn with straight sides and sharp corners")


def writing_stays(bench, step):
    wave = [(20 + i, 50 + 5 * math.sin(i / 3)) for i in range(60)]
    scribble = [(20, 20), (45, 50), (25, 55), (50, 22), (30, 35), (55, 60), (22, 40)]
    hook = [(30, 20), (30, 50), (45, 52)]
    star = [(50, 20), (62, 55), (32, 33), (68, 33), (38, 55), (50, 20)]
    letter = ring(30, 30, 3, 4)
    for corners in (wave, scribble, hook, star, letter):
        assert neatened(bench, strokes.through(corners, step=0.7, wobble=0.2)) is None, corners[:3]
    assert bench.ok("neaten", {"bad": "AQc="}, {"shapes": True}) == {}, "a stroke cut short is left"
    assert neatened(bench, strokes.through([(20, 40), (80, 41)]), shapes=False) is None
    step("writing, small loops, and anything that isn't close to a shape stay as written; with neat shapes off, everything does")


def ruler(bench, step):
    level = {"x": 70, "y": 100, "angle": 0, "length": 120, "width": 18}
    drawn = strokes.through([(20, 87), (60, 89.5), (100, 88)], width=0.5)
    made = neatened(bench, drawn, ruler=level)
    assert {y for _, y, _, _ in made["points"]} <= {90.75, 90.625}, "along the upper edge, half the line's width out"
    was = strokes.decode(drawn)
    assert [(p[2], p[3]) for p in made["points"]] == [(p[2], p[3]) for p in was["points"]], "its pressure and moments kept"
    below = neatened(bench, strokes.through([(100, 112), (30, 110)]), ruler=level)
    assert all(abs(y - 109.25) < 0.2 for _, y, _, _ in below["points"]), "along the lower edge, drawn either way"
    turned = dict(level, angle=30)
    angle = math.radians(30)

    def beside(along, off):
        return (70 + along * math.cos(angle) - off * math.sin(angle), 100 + along * math.sin(angle) + off * math.cos(angle))

    made = neatened(bench, strokes.through([beside(-40, 12), beside(0, 10), beside(40, 13)]), ruler=turned)
    offs = [(y - 100) * math.cos(angle) - (x - 70) * math.sin(angle) for x, y, _, _ in made["points"]]
    assert all(abs(off - 9.25) < 0.2 for off in offs), "along a turned ruler's edge"
    step("a line drawn beside the ruler's edge, level or turned, is laid on it, its pressure kept")

    for corners in ([(20, 60), (80, 61)], [(50, 70), (50, 90)], [(20, 87), (30, 80), (36, 89), (42, 80)], [(150, 88), (185, 88)]):
        assert neatened(bench, strokes.through(corners), ruler=level) is None, corners
    assert "A ruler says" in bench.refused("neaten", strokes.batch(strokes.line(1, 1))["add"], {"ruler": {"x": 1}})
    step("writing away from the ruler, across it or past its end stays as written")
    both = neatened(bench, strokes.through(ring(70, 40, 18, 18)), shapes=True, ruler=level)
    assert both and near(both["points"][0], both["points"][-1], 0.2), "away from the ruler, shapes are still made neat"


def kept(bench, step):
    made = bench.ok("makeNotebook", "Figures", {"kind": "squared", "size": "A5"})
    notebook = [one for one in bench.ok("notebooks")["notebooks"] if one["id"] == made["notebook"]][0]
    page = notebook["pages"][0]["id"]
    batch = strokes.batch(strokes.through(ring(70, 60, 20, 20)), strokes.through([(20, 120), (90, 121)]))
    assert bench.ok("ink", page, batch) == 2
    neat = bench.ok("neaten", batch["add"], {"shapes": True})
    assert sorted(neat) == sorted(batch["add"]) and bench.ok("strokes", page) == batch["add"], "asking keeps nothing"
    assert bench.ok("ink", page, {"add": neat, "remove": []}) == 2 and bench.ok("strokes", page) == neat
    low, high = sorted(box["height"] for box in bench.ok("strokeBounds", page).values())
    assert abs(low - 0.5) < 0.01 and abs(high - 40.5) < 1, (low, high)
    server = FakeServer()
    try:
        serve(bench, server.url)
        server.read("a circle and a line")
        assert bench.ok("recognise", page, {})["text"] == "a circle and a line"
    finally:
        server.close()
    step("a neat stroke takes the drawn one's place under its id, and Omabook reads it as any stroke of the surface")


def check(bench, step):
    lines(bench, step)
    arrows(bench, step)
    round_shapes(bench, step)
    polygons(bench, step)
    triangles(bench, step)
    writing_stays(bench, step)
    ruler(bench, step)
    kept(bench, step)
