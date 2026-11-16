"""Scheduler Assistant: the model's answer is validated against the real timetable.

No network: the provider call is replaced with a canned response.
Run:  python tests/test_assistant.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import assistant as a  # noqa: E402

GROUPS = [
    {"name": "O'LEVEL CS & ENGLISH", "nickname": "CS", "schedule": [{"day": "Monday", "from": "12:00pm", "to": "1:30pm"}]},
    {"name": "SSIES Math O/N 2026", "nickname": "", "schedule": []},
    {"name": "SSIES Tuition B", "nickname": "", "schedule": []},
]


class FakeResponse:
    def __init__(self, status, body):
        self.status_code, self._body, self.text = status, body, json.dumps(body)

    def json(self):
        return self._body


def main():
    # times and days
    assert a.norm_time("3pm") == "3:00pm" and a.norm_time("3:05 PM") == "3:05pm"
    assert a.norm_time("15:00") == "3:00pm" and a.norm_time("12am") == "12:00am" and a.norm_time("12:30pm") == "12:30pm"
    assert a.norm_time("25:00") is None and a.norm_time("13pm") is None and a.norm_time("soon") is None
    assert a.norm_day("wed") == "Wednesday" and a.norm_day("FRIDAY") == "Friday" and a.norm_day("x") is None

    # a good answer, with a nickname, a fenced block and messy casing
    raw = "```json\n" + json.dumps({"reply": "Moved.", "changes": [
        {"op": "clear", "group": "cs", "day": "Mon"},
        {"op": "set", "group": "o'level cs & english", "day": "wednesday", "from": "3 PM", "to": "16:30"},
        {"op": "set", "group": "Ghost Class", "day": "Monday", "from": "3pm"},          # unknown group
        {"op": "set", "group": "SSIES Tuition B", "day": "Funday", "from": "3pm"},      # bad day
        {"op": "set", "group": "SSIES Tuition B", "day": "Tuesday", "from": "later"},   # bad time
        {"op": "delete_everything", "group": "SSIES Tuition B", "day": "Tuesday"},     # unknown op
        {"op": "create_group", "group": "New Batch"},
        {"op": "set", "group": "New Batch", "day": "Sat", "from": "10am", "to": ""},
    ]}) + "\n```"
    out = a.validate(raw, GROUPS)
    assert out["changes"] == [
        {"op": "clear", "group": "O'LEVEL CS & ENGLISH", "day": "Monday"},
        {"op": "set", "group": "O'LEVEL CS & ENGLISH", "day": "Wednesday", "from": "3:00pm", "to": "4:30pm"},
        {"op": "create_group", "group": "New Batch"},
        {"op": "set", "group": "New Batch", "day": "Saturday", "from": "10:00am", "to": ""},
    ], out["changes"]
    assert len(out["skipped"]) == 4 and out["reply"] == "Moved." and out["notice"] is None

    # "SSIES" matches two groups, so it is not guessed
    out = a.validate({"changes": [{"op": "clear", "group": "SSIES", "day": "Monday"}]}, GROUPS)
    assert out["changes"] == [] and len(out["skipped"]) == 1

    # a real name inside a longer word is not a match ("Physics" vs "Astrophysics Club"),
    # but a shortened or padded form of one real name still is
    sci = [{"name": "OLEVEL PHYSICS 2026", "nickname": "Physics", "schedule": []}, {"name": "OLEVEL URDU", "nickname": "", "schedule": []}]
    out = a.validate({"reply": "Astrophysics Club has been moved.", "changes": [{"op": "set", "group": "Astrophysics Club", "day": "Friday", "from": "3pm"}]}, sci)
    assert out["changes"] == [] and len(out["skipped"]) == 1, out
    assert out["reply"] == "Nothing was changed."            # the model's "has been moved" is not passed on
    for said in ("olevel physics", "the Physics class", "OLEVEL PHYSICS 2026 batch"):
        out = a.validate({"changes": [{"op": "clear", "group": said, "day": "Friday"}]}, sci)
        assert [c["group"] for c in out["changes"]] == ["OLEVEL PHYSICS 2026"], (said, out)

    # one-off notice only for a real group
    out = a.validate({"reply": "ok", "changes": [], "notice": {"group": "ssies tuition b", "kind": "Reschedule", "time": "5pm", "note": "x"}}, GROUPS)
    assert out["notice"] == {"group": "SSIES Tuition B", "kind": "reschedule", "time": "5:00pm", "note": "x"}
    assert a.validate({"notice": {"group": "Nope", "kind": "cancel"}}, GROUPS)["notice"] is None

    # not JSON at all
    try:
        a.validate("I cannot help with that", GROUPS)
        raise AssertionError("expected ValueError")
    except ValueError:
        pass

    # the request: timetable in the system message, image as a content part, history capped
    msgs = a.build_messages(GROUPS, "move CS", image="data:image/png;base64,AAAA",
                            history=[{"role": "user", "text": str(i)} for i in range(20)])
    assert "O'LEVEL CS & ENGLISH (also called CS): Monday 12:00pm-1:30pm" in msgs[0]["content"]
    assert len(msgs) == 1 + a.MAX_HISTORY + 1 and msgs[-1]["content"][1]["image_url"]["url"].startswith("data:image/png")

    # provider call: JSON mode rejected -> one retry without it; then error mapping
    calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append((url, dict(json)))
        if "response_format" in json:
            return FakeResponse(400, {"error": {"message": "json mode unsupported"}})
        return FakeResponse(200, {"choices": [{"message": {"content": '{"reply":"hi","changes":[]}'}}]})

    real = a.requests.post
    try:
        a.requests.post = fake_post
        out = a.ask(GROUPS, "hello", {"base_url": "https://example.test/v1/", "api_key": "k", "model": "m"})
        assert out["reply"] == "hi" and len(calls) == 2 and calls[0][0] == "https://example.test/v1/chat/completions"
        for status, needle in ((429, "limit"), (401, "key"), (500, "500")):
            a.requests.post = lambda *x, **k: FakeResponse(status, {"error": {"message": "boom"}})
            try:
                a.ask(GROUPS, "hello", {"base_url": "https://example.test/v1", "api_key": "k", "model": "m"})
                raise AssertionError("expected RuntimeError")
            except RuntimeError as e:
                assert needle in str(e), str(e)

        # ── local fallback ──
        hosted = {"base_url": "https://hosted.test/v1", "api_key": "k", "model": "big"}
        local = {"base_url": "http://ollama:11434/v1", "model": "small"}
        seen = []

        def routed(url, headers=None, json=None, timeout=None):
            seen.append((url.split("/")[2], timeout))
            if "hosted.test" in url:
                return FakeResponse(429, {"error": {"message": "quota"}})
            return FakeResponse(200, {"choices": [{"message": {"content": '{"reply":"from local","changes":[]}'}}]})

        a.requests.post = routed
        out = a.ask_with_fallback(GROUPS, "hello", hosted, local)
        assert out["via"] == "local" and out["reply"] == "from local" and "limit" in out["why"]
        assert seen == [("hosted.test", 45), ("ollama:11434", a.LOCAL_TIMEOUT)], seen          # provider first, local gets the long wait

        # provider healthy: the local model is never called
        seen.clear()
        a.requests.post = lambda url, **k: (seen.append(url), FakeResponse(200, {"choices": [{"message": {"content": '{"reply":"hosted","changes":[]}'}}]}))[1]
        out = a.ask_with_fallback(GROUPS, "hello", hosted, local)
        assert out["via"] == "provider" and len(seen) == 1 and "hosted.test" in seen[0]

        # no provider set up: straight to local; no local either: a clear message
        a.requests.post = routed
        assert a.ask_with_fallback(GROUPS, "hi", {"base_url": "", "api_key": "", "model": ""}, local)["via"] == "local"
        for cfg_local, needle in (({"base_url": "", "model": ""}, "limit"), ({}, "limit")):
            try:
                a.ask_with_fallback(GROUPS, "hi", hosted, cfg_local)
                raise AssertionError("expected RuntimeError")
            except RuntimeError as e:
                assert needle in str(e), str(e)

        # a photo cannot fall back; a provider that is unreachable still falls back for text
        try:
            a.ask_with_fallback(GROUPS, "", hosted, local, image="data:image/png;base64,AAAA")
            raise AssertionError("expected RuntimeError")
        except RuntimeError as e:
            assert "photo" in str(e).lower()

        def down(url, **k):
            if "hosted.test" in url:
                raise a.requests.ConnectionError("no route")
            return FakeResponse(200, {"choices": [{"message": {"content": '{"reply":"ok","changes":[]}'}}]})

        a.requests.post = down
        out = a.ask_with_fallback(GROUPS, "hi", hosted, local)
        assert out["via"] == "local" and "reached" in out["why"]
    finally:
        a.requests.post = real
    print("ok")


if __name__ == "__main__":
    main()
