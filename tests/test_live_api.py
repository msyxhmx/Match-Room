from fastapi.testclient import TestClient

from api.live import get_engine
from api.main import app

client = TestClient(app)
MID = "SCN-comeback"


def test_scenarios_listed_and_playable():
    scenarios = client.get("/api/scenarios").json()
    assert {s["key"] for s in scenarios} == {"comeback", "red-card", "press-and-fade",
                                             "end-to-end"}
    ids = {m["match_id"] for m in client.get("/api/matches").json()}
    assert {s["match_id"] for s in scenarios} <= ids


def test_live_endpoints():
    params = {"persona": "analyst", "lang": "ms", "team": "NGC"}
    snap = client.get(f"/api/matches/{MID}/live", params={"minute": 67, **params})
    assert snap.status_code == 200 and snap.json()["profile"]["language"] == "ms"
    assert client.get(f"/api/matches/{MID}/cards", params={"until": 45}).status_code == 200
    assert client.get(f"/api/matches/{MID}/overlays").json()
    for kind in ("halftime", "fulltime"):
        assert client.get(f"/api/matches/{MID}/brief/{kind}", params=params).status_code == 200
    assert client.get(f"/api/matches/{MID}/catchup", params={"minute": 70}).status_code == 200
    assert len(client.get(f"/api/matches/{MID}/lineups").json()["players"]) == 22
    assert client.get("/api/season", params={"team": "NGC"}).status_code == 200


def test_live_errors():
    assert client.get("/api/matches/NOPE/live").status_code == 404
    assert client.get(f"/api/matches/{MID}/live", params={"lang": "fr"}).status_code == 422
    assert client.get(f"/api/matches/{MID}/brief/extra-time").status_code == 422


def test_events_include_new_types():
    events = client.get(f"/api/matches/{MID}/events", params={"until": 10}).json()
    assert {"pressure", "pass"} <= {e["type"] for e in events}


def test_stream_plays_and_switches_language():
    url = f"/api/matches/{MID}/stream?speed=6000&from_minute=40"
    kinds, labels = [], {}
    with client.websocket_connect(url) as ws:
        while True:
            msg = ws.receive_json()
            kinds.append(msg["type"])
            if msg["type"] == "tick":
                labels[msg["minute"]] = msg["control"]["label"]
                if msg["minute"] == 41:
                    ws.send_json({"profile": {"language": "es"}})
            if msg["type"] == "end":
                break
    assert kinds.count("tick") == 50
    assert kinds.index("halftime") > 0 and "fulltime" in kinds
    engine = get_engine(MID)
    assert labels[41] == engine.control(41, "en").label
    assert labels[90] == engine.control(90, "es").label


def test_stream_unknown_match():
    with client.websocket_connect("/api/matches/NOPE/stream") as ws:
        assert ws.receive_json()["type"] == "error"
