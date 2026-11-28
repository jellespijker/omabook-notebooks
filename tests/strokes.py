"""Strokes as the ink surface writes them, for the tests: a pen moved over a page.

The bytes are Omabook's stroke codec (src/inkcodec.cpp, #78): a version, flags
(pressure, tilt), the colour as ARGB, the width and the moment it began, and
the points, the first whole and each after it as the difference from the one
before, every number a varint (zig-zag where it may be negative), positions in
eighths of an ink unit (here a millimetre of the page), pressure in 1/255.
A stroke made here is one the surface could have sent; the plugin keeps it
without reading it, and Omabook reads it back.
"""

import base64
import random
import string

PRESSURED = 0x01


def varint(value):
    out = bytearray()
    while value >= 0x80:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    out.append(value)
    return bytes(out)


def zigzag(value):
    return value * 2 if value >= 0 else -value * 2 - 1


def encode(points, colour=0xFF1D1D1F, width=0.5, began=1_763_700_000_000):
    """`points` are (x mm, y mm, pressure 0-1, ms since the stroke began)."""
    out = bytearray([1, PRESSURED])
    out += colour.to_bytes(4, "big")
    out += varint(max(1, round(width * 8)))
    out += varint(zigzag(began))
    out += varint(len(points))
    before = (0, 0, 0, 0)
    for x, y, pressure, ms in points:
        now = (round(x * 8), round(y * 8), round(pressure * 255), ms)
        out += varint(zigzag(now[0] - before[0])) + varint(zigzag(now[1] - before[1])) + varint(zigzag(now[2] - before[2]))
        out += varint(max(0, now[3] - before[3]))
        before = now
    return base64.b64encode(bytes(out)).decode()


def new_id():
    return "".join(random.choice(string.ascii_letters + string.digits + "-_") for _ in range(12))


def line(x, y, length=30, **options):
    """A pen stroke from (x, y) across, pressing harder in the middle."""
    steps = 20
    pressure = [0.3 + 0.5 * (1 - abs(i - steps / 2) / (steps / 2)) for i in range(steps + 1)]
    points = [(x + length * i / steps, y + 0.4 * (i % 3), pressure[i], i * 8) for i in range(steps + 1)]
    return encode(points, **options)


def batch(*encoded, remove=()):
    """An ink batch, as the surface's `inked` sends it: {add: {id: base64}, remove: [id]}."""
    return {"add": {new_id(): one for one in encoded}, "remove": list(remove)}


def decode(text):
    """A stroke read back: {flags, colour, width mm, began, points [(x mm, y mm, pressure 0-1, ms)]}.
    Every byte must be used, as Omabook's codec has it."""
    data = base64.b64decode(text, validate=True)
    assert data[0] == 1 and data[1] <= 7, data[:2]
    at = 6

    def number():
        nonlocal at
        value = shift = 0
        while True:
            byte = data[at]
            at += 1
            value |= (byte & 0x7F) << shift
            shift += 7
            if byte < 0x80:
                return value

    def signed():
        value = number()
        return value >> 1 if value % 2 == 0 else -(value >> 1) - 1

    width, began, count = number() / 8, signed(), number()
    x = y = pressure = ms = 0
    points = []
    for _ in range(count):
        x, y = x + signed(), y + signed()
        if data[1] & PRESSURED:
            pressure += signed()
        if data[1] & 0x02:
            signed(), signed()
        ms += number()
        points.append((x / 8, y / 8, pressure / 255, ms))
    assert at == len(data), "bytes after the last point"
    return {"flags": data[1], "colour": int.from_bytes(data[2:6], "big"), "width": width, "began": began, "points": points}


def through(corners, step=1.5, wobble=0.35, **options):
    """A hand drawing through `corners` [(x, y)]: points `step` mm apart, off by up to `wobble`."""
    shake = random.Random(len(corners) * 31 + int(corners[0][0]))
    points = []
    for (ax, ay), (bx, by) in zip(corners, corners[1:], strict=False):
        pieces = max(1, int(((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5 / step))
        for i in range(pieces):
            t = i / pieces
            points.append((ax + (bx - ax) * t + shake.uniform(-wobble, wobble), ay + (by - ay) * t + shake.uniform(-wobble, wobble)))
    points.append(corners[-1])
    return encode([(x, y, 0.4 + 0.2 * (i % 2), i * 9) for i, (x, y) in enumerate(points)], **options)
