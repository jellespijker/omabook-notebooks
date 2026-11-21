"""The scratch bench the tests drive Omabook on: HOME and the XDG folders in a
scratch folder, and the plugin installed there. See tests/run.py for what is
done on it.
"""

import json
import os
import shutil
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OMABOOK = os.environ.get("OMABOOK") or shutil.which("omabook")
NAME = "notebooks"


class Bench:
    def __init__(self):
        self.scratch = tempfile.mkdtemp(prefix="notebooks-test-")
        self.home = os.path.join(self.scratch, "home")
        self.config = os.path.join(self.home, ".config")
        self.plugins = os.path.join(self.config, "omabook", "plugins")
        self.plugin = os.path.join(self.plugins, NAME)
        self.library = os.path.join(self.scratch, "library")
        for folder in (self.plugins, self.library):
            os.makedirs(folder)
        self.env = dict(
            os.environ,
            HOME=self.home,
            XDG_CONFIG_HOME=self.config,
            XDG_CACHE_HOME=os.path.join(self.home, ".cache"),
            XDG_DATA_HOME=os.path.join(self.home, ".data"),
            # Omabook's own log (omabook.log) and the file manager's folders live here.
            XDG_STATE_HOME=os.path.join(self.home, ".state"),
            QT_QPA_PLATFORM="offscreen",
        )
        self.env.pop("ANTHROPIC_API_KEY", None)
        with open(os.path.join(self.config, "omabook", "config.json"), "w") as file:
            json.dump({"library": self.library, "graph": "off"}, file)
        # The plugin as it would be installed: everything but tests and data.
        shutil.copytree(ROOT, self.plugin, ignore=shutil.ignore_patterns(".git", "data", "tests", ".scratch", "__pycache__"))

    def omabook(self, *arguments, timeout=120, check=True):
        done = subprocess.run(
            [OMABOOK] + [str(argument) for argument in arguments] + ["--library", self.library],
            env=self.env,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if check and done.returncode != 0:
            raise AssertionError(f"omabook {' '.join(map(str, arguments))} failed:\n{done.stdout}\n{done.stderr}")
        return done

    def run(self, what, *arguments, timeout=120):
        """Runs a function or an event of the plugin; answers {result, said, log, error?}.

        One word of a command line holds at most 128 KiB, and Omabook joins the words after
        the function's name with a space: long JSON (a picture) goes as the words between its
        spaces, and a long string in it as a list of pieces (see pieces())."""
        given = json.dumps(list(arguments)) if ":" not in what else json.dumps(arguments[0])
        done = self.omabook(
            "plugin",
            "run",
            NAME,
            what,
            *(given.split(" ") if len(given) > 100_000 else [given]),
            "--folder",
            self.plugins,
            "--json",
            timeout=timeout,
            check=False,
        )
        try:
            return json.loads(done.stdout)
        except ValueError:
            raise AssertionError(f"plugin run {what} printed no JSON:\n{done.stdout}\n{done.stderr}") from None

    @staticmethod
    def pieces(text, size=100_000):
        """A long string as the list of pieces a plugin's function joins again."""
        return [text[at : at + size] for at in range(0, len(text), size)]

    def ok(self, what, *arguments, **options):
        answer = self.run(what, *arguments, **options)
        if answer.get("error"):
            log = "\n".join(answer.get("log", []))
            raise AssertionError(f"{what} failed: {answer['error']}\n{log}")
        return answer["result"]

    def refused(self, what, *arguments):
        """What the plugin said when it refused, which must be a reason a person can act on."""
        answer = self.run(what, *arguments)
        assert answer.get("error"), (what, arguments, answer)
        return answer["error"]

    def json(self, *arguments):
        return json.loads(self.omabook(*arguments, "--json").stdout)

    def books(self):
        return {entry["id"]: entry for entry in self.json("list")}

    def reach(self, other):
        """Lets `omabook sync other:<folder>` reach the other bench as if it were another computer.

        Sync goes over ssh; an `ssh` of the scratch folder's own, first on the PATH, runs
        the command it is given here instead, as the other bench (its HOME and its library)."""
        folder = os.path.join(self.scratch, "bin")
        os.makedirs(folder, exist_ok=True)
        names = ("HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME")
        there = " ".join(f"{name}={other.env[name]}" for name in names)
        script = f'#!/bin/sh\nwhile [ "$1" != "--" ]; do shift; done\nshift 2\nexec env {there} QT_QPA_PLATFORM=offscreen sh -c "$*"\n'
        with open(os.path.join(folder, "ssh"), "w") as file:
            file.write(script)
        os.chmod(os.path.join(folder, "ssh"), 0o755)
        self.env["PATH"] = folder + os.pathsep + self.env["PATH"]
        return "other:" + other.library

    def snapshot_file(self, notebook):
        return os.path.join(self.plugin, "data", "notebooks", notebook + ".omanotebook")

    def snapshot(self, notebook):
        with open(self.snapshot_file(notebook), encoding="utf-8") as file:
            return json.load(file)
