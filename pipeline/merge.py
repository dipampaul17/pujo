"""One puja listed under two names: drop the duplicate, keep the canonical entry (status, pass and X evidence are keyed to it)."""
MERGE = {'tala-park': 'tala-prattoy'}  # Tala Prattoy is Tala Park Sarbojanin's puja, 8/1 Rajkumar Chatterjee Rd (thepujo.com, kolkatadurgotsav.com, talaprattoy.com)
def apply(data):
    keep = {p['id'] for p in data['pandals']}
    assert all(v in keep for v in MERGE.values())
    n = len(data['pandals']); data['pandals'] = [p for p in data['pandals'] if p['id'] not in MERGE]; return n - len(data['pandals'])
