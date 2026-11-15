import struct, zlib

def load(path):
    d = open(path, 'rb').read(); i = 8; idat = b''
    while i < len(d):
        l, t = struct.unpack('>I4s', d[i:i+8]); c = d[i+8:i+8+l]
        if t == b'IHDR': w, h, bd, ct = struct.unpack('>IIBB', c[:10]); assert bd == 8 and ct == 6, "expects 8-bit RGBA"
        if t == b'IDAT': idat += c
        i += 12 + l
    raw = zlib.decompress(idat); bpp = 4; st = w * bpp; rows = []; prev = bytearray(st); o = 0
    for y in range(h):
        f = raw[o]; o += 1; line = bytearray(raw[o:o+st]); o += st
        for x in range(st):
            a = line[x-bpp] if x >= bpp else 0; b = prev[x]; c = prev[x-bpp] if x >= bpp else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line); prev = line
    return w, h, [[tuple(r[x*4:x*4+4]) for x in range(w)] for r in rows]

def save(path, px):
    h = len(px); w = len(px[0])
    raw = b''.join(b'\x00' + bytes(v for p in row for v in p) for row in px)
    chunk = lambda t, data: struct.pack('>I', len(data)) + t + data + struct.pack('>I', zlib.crc32(t + data) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                           + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def scale_nearest(px, k, bg=None):
    """Upscale for previewing; optionally composite on a solid background."""
    out = []
    for row in px:
        line = []
        for p in row:
            q = p if bg is None or p[3] else bg
            line += [q] * k
        out += [line[:] for _ in range(k)]
    return out
