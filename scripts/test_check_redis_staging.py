import os
import unittest
from unittest.mock import patch

from check_redis_staging import validate_target, worker_environment


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


if __name__ == "__main__":
    unittest.main()
