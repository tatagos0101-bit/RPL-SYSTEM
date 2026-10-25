"""Synthetic proxy/CSP configuration; no browser or cloud access."""
import json
from pathlib import Path
import shutil

import pytest

from scripts import configure_vercel

ROOT = Path(__file__).resolve().parents[1]


def policy(config):
    value = next(header["value"] for rule in config["headers"] for header in rule["headers"]
                 if header["key"] == "Content-Security-Policy")
    return {parts[0]: parts[1:] for item in value.split(";") if (parts := item.strip().split())}


@pytest.fixture()
def configs(tmp_path, monkeypatch):
    (tmp_path / "frontend").mkdir()
    for name in ("vercel.json", "frontend/vercel.json"):
        shutil.copyfile(ROOT / name, tmp_path / name)
    monkeypatch.setattr(configure_vercel, "ROOT", tmp_path)
    return [tmp_path / "vercel.json", tmp_path / "frontend/vercel.json"]


def test_frontend_configs_enforce_matching_script_and_connection_boundaries():
    configs = [json.loads((ROOT / path).read_text()) for path in ("vercel.json", "frontend/vercel.json")]
    assert policy(configs[0]) == policy(configs[1])
    rules = policy(configs[0])
    assert rules["default-src"] == ["'none'"]
    assert rules["script-src"] == ["'self'"]
    assert rules["script-src-attr"] == ["'none'"]
    assert rules["object-src"] == rules["frame-src"] == rules["worker-src"] == ["'none'"]
    assert rules["form-action"] == ["'self'"]
    assert not {"*", "https:", "http:", "data:", "blob:"}.intersection(rules["connect-src"])
    assert "https://quzhxkgkdrctiosyjxcr.supabase.co" in rules["connect-src"]
    assert {"data:", "blob:", "https:"} <= set(rules["img-src"])
    # Security headers must not accidentally catch API, upload and health proxies.
    assert all(rule["source"] == "/((?!api(?:/|$)|uploads(?:/|$)|health(?:/|$)).*)"
               for config in configs for rule in config["headers"])


def test_reconfiguration_replaces_api_origin_and_preserves_other_policies(configs):
    originals = [json.loads(path.read_text()) for path in configs]
    configure_vercel.configure("https://api.example.test/")
    configure_vercel.configure("https://next.example.test")
    first = [path.read_bytes() for path in configs]
    configure_vercel.configure("https://next.example.test")
    assert [path.read_bytes() for path in configs] == first
    for original, path in zip(originals, configs):
        current = json.loads(path.read_text())
        before, after = policy(original), policy(current)
        assert set(after["connect-src"]) == (set(before["connect-src"]) - {"https://rpl-system-api.vercel.app"}) | {"https://next.example.test"}
        assert {key:value for key,value in before.items() if key != "connect-src"} == {
            key:value for key,value in after.items() if key != "connect-src"}
        assert current["rewrites"][0]["destination"] == "https://next.example.test/api/:path*"
        assert current["rewrites"][-1] == original["rewrites"][-1]
        assert current["headers"][0]["headers"][1:] == original["headers"][0]["headers"][1:]


@pytest.mark.parametrize("url", ["http://api.test", "https://user:password@api.test",
    "https://api.test/path", "https://api.test?x=1", "https://api.test#fragment",
    "https://api.test;script-src", "https://api.test\n", "https://api.test 'unsafe-inline'"])
def test_invalid_origin_cannot_change_either_configuration(configs, url):
    before = [path.read_bytes() for path in configs]
    with pytest.raises(ValueError):
        configure_vercel.configure(url)
    assert [path.read_bytes() for path in configs] == before
