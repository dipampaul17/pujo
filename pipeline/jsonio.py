"""Atomic JSON writes: a reader (the app, gh-pages publish, a concurrent run) never sees a half-written file."""
import json, os, tempfile
def write_json(path, obj, **kw):
    kw.setdefault('ensure_ascii', False)
    d = os.path.dirname(os.path.abspath(path)); os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.tmp-', suffix='.json')
    try:
        with os.fdopen(fd, 'w') as f: json.dump(obj, f, **kw); f.flush(); os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try: os.unlink(tmp)
        except OSError: pass
        raise
