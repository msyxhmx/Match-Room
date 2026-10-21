from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_matches_events_and_halftime():
    matches = client.get("/api/matches").json()
    assert matches
    mid = matches[0]["match_id"]

    events = client.get(f"/api/matches/{mid}/events", params={"until": 45}).json()
    assert events and max(e["minute"] for e in events) <= 45

    report = client.get(f"/api/matches/{mid}/halftime").json()
    assert report["match_id"] == mid
    assert {"story", "prediction", "what_to_watch", "stats", "momentum"} <= set(report)


def test_unknown_match_404():
    assert client.get("/api/matches/NOPE/halftime").status_code == 404


def test_matches_sorted_by_closest_game():
    matches = client.get("/api/matches").json()
    tops = []
    for m in matches:
        report = client.get(f"/api/matches/{m['match_id']}/halftime").json()
        tops.append(max(report["prediction"]["result"].values()))
    assert tops[0] == min(tops)
    assert tops == sorted(tops)
