# The service (app/server.py) running in the visitor's browser, inside Pyodide in a web worker.
# The browser cannot start threads, so the work the service hands to a thread (an Atlas job, a pool
# of Atlas bytes) runs right after the request that started it, and its tiles run one after another.
# Atlas is reached through a small relay (ATLAS_RELAY), since Atlas does not answer web pages directly.
import concurrent.futures
import json
import os
import sys
import threading
import time

os.environ["QUANTUM_SCULPTING_HOME"] = "/home/pyodide/qs"
if ATLAS_RELAY:
    os.environ["ATLAS_API_BASE"] = ATLAS_RELAY

try:
    import pyodide_http
    pyodide_http.patch_all()          # requests goes through the browser's own HTTP
except ImportError:
    pass

# Atlas jobs wait between status checks; where the browser's sleep does not wait, wait by the clock
_t0 = time.time()
time.sleep(0.02)
if time.time() - _t0 < 0.015:
    def _sleep(seconds):
        end = time.time() + seconds
        while time.time() < end:
            pass
    time.sleep = _sleep

_later = []


class _Thread:
    def __init__(self, group=None, target=None, name=None, args=(), kwargs=None, daemon=None):
        self._run = lambda: target(*args, **(kwargs or {}))

    def start(self):
        _later.append(self._run)

    def join(self, timeout=None):
        pass

    def is_alive(self):
        return False


class _InTurn:
    """ThreadPoolExecutor's interface, doing each piece of work as it is handed over."""

    def __init__(self, max_workers=None, **kw):
        pass

    def submit(self, fn, *args, **kwargs):
        f = concurrent.futures.Future()
        try:
            f.set_result(fn(*args, **kwargs))
        except BaseException as e:
            f.set_exception(e)
        return f

    def map(self, fn, *its, **kw):
        return [fn(*a) for a in zip(*its)]

    def shutdown(self, wait=True, **kw):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


threading.Thread = _Thread
concurrent.futures.ThreadPoolExecutor = _InTurn

sys.path.insert(0, "/qs/app")
import server  # noqa: E402

_client = server.app.test_client()
_client.environ_base["HTTP_HOST"] = "127.0.0.1"


def handle(method, path, headers, body):
    """One request of the interface: (status, headers as JSON, body bytes)."""
    data = body.to_bytes() if body is not None else None
    r = _client.open(path, method=method, headers=json.loads(headers), data=data)
    return r.status_code, json.dumps(dict(r.headers)), r.get_data()


def run_later():
    """Work a request started for afterwards (an Atlas job); True if there was any."""
    did = bool(_later)
    while _later:
        _later.pop(0)()
    return did
