"""Pitch plate for the overlay shot (STORYBOARD S7).

A clean broadcast-angle render of a FIFA 105 x 68 m pitch: mown stripes, white markings, two
goals for soft shadows, and nothing else (no stadium, crowd, logos or boards). It should read as
a render, not footage, because the match data is synthetic.

Re-render (about a minute on an M3):
    /Applications/Blender.app/Contents/MacOS/Blender -b -P web/assets-src/pitch.py
Optional: append `-- --preview` for a quick 480x270 test.
"""

import math
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "public" / "plates" / "pitch.png"
PREVIEW = "--preview" in sys.argv

LENGTH, WIDTH = 105.0, 68.0
LINE = 0.12  # FIFA line width
STRIPES = 18  # even, so halfway sits on a stripe edge
RUNOFF = 7.0
Z = 0.006  # markings sit just above the grass


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0  # no pitch.blend1 backups


def material(name, colour, rough=0.8):
    m = bpy.data.materials.new(name)
    bsdf = m.node_tree.nodes.get("Principled BSDF") if m.use_nodes else None
    if bsdf is None:
        m.use_nodes = True
        bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = rough
    return m


def srgb(h):
    """Hex to linear RGB."""
    out = []
    for i in (1, 3, 5):
        c = int(h[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def grass_material():
    m = bpy.data.materials.new("Grass")
    m.use_nodes = True
    nt = m.node_tree
    n, link = nt.nodes, nt.links.new
    bsdf = n["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    coord = n.new("ShaderNodeTexCoord")
    sep = n.new("ShaderNodeSeparateXYZ")
    link(coord.outputs["Object"], sep.inputs[0])
    # Stripe index = floor((x + L/2) / stripe width), parity picks light or dark.
    add = n.new("ShaderNodeMath")
    add.operation = "ADD"
    add.inputs[1].default_value = LENGTH / 2
    div = n.new("ShaderNodeMath")
    div.operation = "DIVIDE"
    div.inputs[1].default_value = LENGTH / STRIPES
    flo = n.new("ShaderNodeMath")
    flo.operation = "FLOOR"
    mod = n.new("ShaderNodeMath")
    mod.operation = "FLOORED_MODULO"
    mod.inputs[1].default_value = 2
    link(sep.outputs["X"], add.inputs[0])
    link(add.outputs[0], div.inputs[0])
    link(div.outputs[0], flo.inputs[0])
    link(flo.outputs[0], mod.inputs[0])
    mix = n.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["A"].default_value = (*srgb("#3E8E45"), 1)
    mix.inputs["B"].default_value = (*srgb("#4FA055"), 1)
    link(mod.outputs[0], mix.inputs["Factor"])
    # A very faint large-scale variation so it isn't flat, but no fine noise (it smears in video).
    noise = n.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.04
    link(coord.outputs["Object"], noise.inputs["Vector"])
    mul = n.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 0.06
    link(mix.outputs["Result"], mul.inputs["A"])
    link(noise.outputs["Color"], mul.inputs["B"])
    link(mul.outputs["Result"], bsdf.inputs["Base Color"])
    return m


def box(name, x, y, sx, sy, mat, z=Z, sz=0.002):
    bpy.ops.mesh.primitive_cube_add(location=(x, y, z))
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx / 2, sy / 2, sz / 2)
    o.data.materials.append(mat)
    return o


def ring(name, x, y, r, mat, start=0.0, end=2 * math.pi, seg=128):
    """A flat band of width LINE centred on radius r, from angle start to end."""
    verts, faces = [], []
    for i in range(seg + 1):
        a = start + (end - start) * i / seg
        for rr in (r - LINE / 2, r + LINE / 2):
            verts.append((x + rr * math.cos(a), y + rr * math.sin(a), Z))
    for i in range(seg):
        a, b = 2 * i, 2 * i + 2
        faces.append((a, a + 1, b + 1, b))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(mat)
    return o


def disc(name, x, y, r, mat):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=0.002, location=(x, y, Z), vertices=48)
    bpy.context.active_object.data.materials.append(mat)


def markings(white):
    hl, hw = LENGTH / 2, WIDTH / 2
    # Touchlines and goal lines: the outer edge of the line is the pitch edge.
    box("touch_s", 0, -hw + LINE / 2, LENGTH, LINE, white)
    box("touch_n", 0, hw - LINE / 2, LENGTH, LINE, white)
    box("goal_w", -hl + LINE / 2, 0, LINE, WIDTH, white)
    box("goal_e", hl - LINE / 2, 0, LINE, WIDTH, white)
    box("halfway", 0, 0, LINE, WIDTH, white)
    ring("centre_circle", 0, 0, 9.15, white)
    disc("centre_spot", 0, 0, 0.15, white)
    for side in (-1, 1):
        gx = side * hl
        # Penalty area 16.5 deep x 40.32 wide; goal area 5.5 x 18.32.
        for depth, wide, tag in ((16.5, 40.32, "pen"), (5.5, 18.32, "six")):
            ix = gx - side * depth
            box(f"{tag}_front_{side}", ix, 0, LINE, wide + LINE, white)
            for s in (-1, 1):
                box(f"{tag}_side_{side}_{s}", (gx + ix) / 2, s * wide / 2, depth, LINE, white)
        spot = gx - side * 11
        disc(f"pen_spot_{side}", spot, 0, 0.15, white)
        # Penalty arc: radius 9.15 from the spot, only the part outside the area.
        edge = math.acos((16.5 - 11) / 9.15)
        centre = math.pi if side > 0 else 0.0
        ring(f"arc_{side}", spot, 0, 9.15, white, centre - edge, centre + edge, 64)
        for s in (-1, 1):
            a0 = math.pi if side > 0 else 0.0
            a0 = a0 + (0 if s < 0 else 0)
            # Corner arcs: radius 1 m, quarter circle into the pitch.
            cx, cy = gx, s * hw
            start = math.atan2(-s, -side)
            ring(
                f"corner_{side}_{s}",
                cx,
                cy,
                1.0,
                white,
                start - math.pi / 4,
                start + math.pi / 4,
                24,
            )


def goal(side, white):
    """Simple frame: 7.32 m wide, 2.44 m high, 12 cm posts, plus a faint net box."""
    gx = side * (LENGTH / 2 + 0.06)
    r = 0.06
    for s in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(
            radius=r, depth=2.44, location=(gx, s * 3.66, 1.22), vertices=24
        )
        bpy.context.active_object.data.materials.append(white)
    bpy.ops.mesh.primitive_cylinder_add(
        radius=r,
        depth=7.32 + 2 * r,
        location=(gx, 0, 2.44),
        rotation=(math.pi / 2, 0, 0),
        vertices=24,
    )
    bpy.context.active_object.data.materials.append(white)
    net = material("Net", (0.95, 0.95, 0.95), 0.9)
    net.blend_method = "BLEND" if hasattr(net, "blend_method") else None
    bsdf = net.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Alpha"].default_value = 0.35
    depth = 2.0
    bpy.ops.mesh.primitive_cube_add(location=(gx + side * depth / 2, 0, 1.2))
    o = bpy.context.active_object
    o.scale = (depth / 2, 3.66, 1.2)
    o.data.materials.append(net)


def flags(white):
    pole = material("Flag", srgb("#F2F2F7"), 0.6)
    for sx in (-1, 1):
        for sy in (-1, 1):
            bpy.ops.mesh.primitive_cylinder_add(
                radius=0.03,
                depth=1.5,
                location=(sx * LENGTH / 2, sy * WIDTH / 2, 0.75),
                vertices=12,
            )
            bpy.context.active_object.data.materials.append(pole)


def scene():
    reset()
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = 480 if PREVIEW else 1920
    sc.render.resolution_y = 270 if PREVIEW else 1080
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    ee = sc.eevee
    for attr, val in (
        ("taa_render_samples", 64 if not PREVIEW else 16),
        ("use_shadows", True),
        ("use_raytracing", True),
        ("shadow_ray_count", 3),
        ("shadow_step_count", 12),
    ):
        if hasattr(ee, attr):
            setattr(ee, attr, val)

    # Ground: plain grass run-off, then a calm light grey floor beyond so the frame stays neutral.
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    g = bpy.context.active_object
    g.scale = (LENGTH + 2 * RUNOFF, WIDTH + 2 * RUNOFF, 1)
    bpy.ops.object.transform_apply(scale=True)  # so Object coordinates are in metres
    g.data.materials.append(grass_material())
    bpy.ops.mesh.primitive_plane_add(size=6000, location=(0, 0, -0.01))
    bpy.context.active_object.data.materials.append(material("Floor", srgb("#D9DCD6"), 0.95))

    white = material("Line", srgb("#F4F5F2"), 0.55)
    markings(white)
    for side in (-1, 1):
        goal(side, white)
    flags(white)

    # Light: a low afternoon sun from behind the camera's left, soft (large angle).
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 3.2
    sun.angle = math.radians(6)
    so = bpy.data.objects.new("Sun", sun)
    bpy.context.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), math.radians(-18), math.radians(-35))

    world = bpy.data.worlds.new("World")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*srgb("#EEF1F4"), 1)
    bg.inputs["Strength"].default_value = 1.1

    # Camera: the main broadcast gantry, centre line, raised, looking across the pitch.
    cam = bpy.data.cameras.new("Cam")
    cam.lens = 23.5
    cam.sensor_width = 36
    co = bpy.data.objects.new("Cam", cam)
    bpy.context.collection.objects.link(co)
    co.location = (0, -WIDTH / 2 - 38, 30)
    co.rotation_euler = (math.radians(66), 0, 0)
    sc.camera = co

    sc.render.filepath = str(OUT.with_name("pitch-preview.png") if PREVIEW else OUT)
    if not PREVIEW:  # a preview must not overwrite the committed full-size scene
        bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "pitch.blend"))
    bpy.ops.render.render(write_still=True)
    print("WROTE", sc.render.filepath)


scene()
