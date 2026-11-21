"""Opus files as Omabook's recorder writes them, for the tests: Ogg pages (RFC 3533) holding an
OpusHead, OpusTags with the moment it was started (DATE, to the millisecond, as src/opuswriter.cpp
writes it) and sound of a given length (RFC 7845). The sound is silence: what is tested is where
its moments fall, which `omabook.audio.info` reads from the pages without playing them.
"""

import struct

PRESKIP = 312
RATE = 48000


def crc(data):
    value = 0
    for byte in data:
        value ^= byte << 24
        for _ in range(8):
            value = ((value << 1) ^ 0x04C11DB7) if value & 0x80000000 else value << 1
            value &= 0xFFFFFFFF
    return value


def page(packets, granule, sequence, kind=0):
    table = bytearray()
    for packet in packets:
        table += bytes([255] * (len(packet) // 255) + [len(packet) % 255])
    header = struct.pack("<4sBBqIII", b"OggS", 0, kind, granule, 0x5EC0DE, sequence, 0) + bytes([len(table)]) + table
    body = b"".join(packets)
    whole = bytearray(header + body)
    whole[22:26] = struct.pack("<I", crc(whole))
    return bytes(whole)


def comment(text):
    data = text.encode()
    return struct.pack("<I", len(data)) + data


def recording(started, milliseconds):
    """An Opus file begun at `started` (ISO, UTC), `milliseconds` long, of 20 ms packets of silence."""
    head = b"OpusHead" + struct.pack("<BBHIhB", 1, 1, PRESKIP, RATE, 0, 0)
    vendor = b"notebooks tests"
    tags = b"OpusTags" + struct.pack("<I", len(vendor)) + vendor + struct.pack("<I", 1) + comment("DATE=" + started)
    out = page([head], 0, 0, kind=2) + page([tags], 0, 1)
    frames = max(1, milliseconds // 20)
    sequence = 2
    for first in range(0, frames, 50):
        count = min(50, frames - first)
        granule = PRESKIP + (first + count) * 960
        last = first + count >= frames
        out += page([b"\xf8\xff\xfe"] * count, granule, sequence, kind=4 if last else 0)
        sequence += 1
    return out
