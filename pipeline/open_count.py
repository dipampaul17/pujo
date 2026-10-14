"""The one Open set: public/live/status.json (X evidence + DP overrides), exactly what the app shows.
state/xlive.json 'open' is only the poller's raw findings feeding status.py; never report it as the open count."""
import json, os, sys
H = os.path.dirname(os.path.abspath(__file__))
def open_set(path=f'{H}/../public/live/status.json'):
    o = json.load(open(path))['open']
    return sorted(k for k, v in o.items() if v.get('kind') != 'closed'), sorted(k for k, v in o.items() if v.get('kind') == 'closed')
if __name__ == '__main__':
    op, cl = open_set(); print(f'open {len(op)}: ' + ', '.join(op)); print(f'closed {len(cl)}: ' + ', '.join(cl))
