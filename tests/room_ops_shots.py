#!/usr/bin/env python3
"""T1 (task-13): is_task_shot / task_screenshots only accept this task's screenshots.

Loads scripts/room-ops.py by path (the file name has a dash, so a plain import would not work),
creates a temp .agents folder, then checks the filter on fake paths and on real files.

Run: python3 -I tests/room_ops_shots.py  (exit 0 = pass)
"""
import importlib.util
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_room_ops():
    spec = importlib.util.spec_from_file_location("room_ops_shots_mod", os.path.join(ROOT, "scripts", "room-ops.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_is_task_shot(mod, t, names, anywhere):
    want = {"task-13-panel.png": True, "run-task-13-abc-x.png": True,
            "task-04-build.png": False, "edge-layout.png": False}
    for name in names:
        got = mod.is_task_shot(t, os.path.join(anywhere, name))
        assert got == want[name], f"is_task_shot({name!r}) = {got}, want {want[name]}"


def test_task_screenshots(mod, t, names):
    with tempfile.TemporaryDirectory() as tmp:
        mod.AG = tmp   # screenshots() globs AG/screenshots/** at call time
        shot_dir = os.path.join(tmp, "screenshots")
        os.makedirs(shot_dir)
        for name in names:
            with open(os.path.join(shot_dir, name), "w") as f:
                f.write("x")
        got = {os.path.basename(p) for p in mod.task_screenshots(t, recorded=[])}
        assert got == {"task-13-panel.png", "run-task-13-abc-x.png"}, f"task_screenshots returned {got}"


def main():
    mod = load_room_ops()
    t = {"id": "T13", "slug": "task-13-abc"}
    names = ["task-13-panel.png", "task-04-build.png", "edge-layout.png", "run-task-13-abc-x.png"]
    test_is_task_shot(mod, t, names, "somewhere/else")
    test_task_screenshots(mod, t, names)
    print("T1: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
