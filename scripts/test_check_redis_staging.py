from contextlib import redirect_stdout
import io
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from check_redis_staging import main, validate_target, worker_environment


class StagingGuards(unittest.TestCase):
    def test_does_not_inherit_production_credentials_or_load_dotenv(self):
        with patch.dict(os.environ, {"DATABASE_URL": "private-production-sentinel",
                                     "RATE_LIMIT_STORAGE_URI": "private-production-sentinel",
                                     "SUPABASE_SERVICE_ROLE_KEY": "private-production-sentinel"}):
            result = worker_environment("rediss://:synthetic@staging.test:6379/0")
        self.assertNotIn("private-production-sentinel", str(result))
        self.assertEqual(result["PYTHON_DOTENV_DISABLED"], "1")
        self.assertEqual(result["AUTO_MIGRATE"], "false")
        self.assertEqual(result["RATE_LIMIT_STORAGE_URI"], "")

    def test_target_requires_exact_host_tls_and_authentication(self):
        validate_target("rediss://:synthetic@staging.test:6379/0", "staging.test")
        for uri in ("redis://:synthetic@staging.test:6379/0",
                    "rediss://:synthetic@production.test:6379/0",
                    "rediss://staging.test:6379/0",
                    "rediss://:synthetic@staging.test:6379/0?ssl_cert_reqs=none"):
            with self.subTest(uri=uri), self.assertRaises(ValueError) as error:
                validate_target(uri, "staging.test")
            self.assertNotIn("synthetic", str(error.exception))

    def test_acceptance_isolates_child_and_requires_both_tests_to_pass(self):
        uri = "rediss://:synthetic@staging.test:6379/0"
        for summary, expected in (("2 passed", 0), ("1 passed, 1 skipped", 1)):
            with self.subTest(summary=summary), patch.dict(os.environ, {
                "RPL_REDIS_STAGING_URI": uri, "PYTHONPATH": "private-production-sentinel",
                "SUPABASE_SERVICE_ROLE_KEY": "private-production-sentinel",
            }), patch("sys.argv", ["check", "--acceptance", "--staging-host", "staging.test"]), \
                    patch("check_redis_staging.importlib.util.find_spec", return_value=SimpleNamespace(
                        origin=str(Path(__file__).resolve().parent / "overlay/pytest/__init__.py"))), \
                    patch("check_redis_staging.subprocess.run", return_value=SimpleNamespace(
                        returncode=0, stdout=summary + uri, stderr=uri)) as run, \
                    redirect_stdout(io.StringIO()) as output:
                self.assertEqual(main(), expected)
                command = run.call_args.args[0]
                environment = run.call_args.kwargs["env"]
                self.assertNotIn(uri, str(command))
                self.assertNotIn("private-production-sentinel", str(environment))
                self.assertEqual(environment["RPL_RUN_REDIS_ACCEPTANCE"], "1")
                self.assertEqual(environment["RPL_REDIS_STAGING_HOST"], "staging.test")
                self.assertIn("--tb=no", command)
                self.assertNotIn(uri, output.getvalue())


if __name__ == "__main__":
    unittest.main()
