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
    finally:
        a.requests.post = real
    print("ok")


if __name__ == "__main__":
    main()
