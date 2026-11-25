from contextlib import redirect_stdout, redirect_stderr
import io
import json
from pathlib import Path
import tempfile
import unittest

from evaluate_id_face_policy import evaluate, main


def row(expected="same", values=(.01, .1, .15)):
    return dict(zip(("expected", "id_to_saved", "live_to_saved", "live_to_id"), (expected, *values)))


class PolicyEvaluationTests(unittest.TestCase):
    def test_all_three_distances_and_strict_boundary_affect_the_outcome(self):
        result = evaluate([row(), row(values=(.01, .45, .1)), row("different", (.01, .1, .1)),
            row("different", (.45, .1, .1)), row("different", (.01, .1, .45))])
        self.assertEqual(result["counts"], {"genuine_trials": 2, "different_person_trials": 3,
            "true_accepts": 1, "false_rejects": 1, "false_accepts": 1, "true_rejects": 2})
        self.assertEqual(result["maximum_distance"], .45)
        self.assertEqual(result["false_rejection_rate"], .5)
        self.assertAlmostEqual(result["false_acceptance_rate"], 1 / 3)
        self.assertFalse(result["validated_for_production"])

    def test_one_failure_cannot_estimate_false_acceptance_or_validate_the_policy(self):
        result = evaluate([row(values=(.01, .8, .9))])
        self.assertEqual(result["coverage"], "incomplete")
        self.assertIsNone(result["false_acceptance_rate"])
        self.assertIsNone(result["false_acceptance_wilson_95"])
        self.assertFalse(result["validated_for_production"])
        self.assertEqual(evaluate([])["coverage"], "incomplete")

    def test_zero_observed_errors_still_has_nonzero_uncertainty(self):
        result = evaluate([row(), row("different", (.01, .9, .8))])
        self.assertEqual(result["false_acceptance_rate"], 0)
        self.assertGreater(result["false_acceptance_wilson_95"][1], .7)
        self.assertFalse(result["validated_for_production"])

    def test_invalid_scores_limits_and_private_extra_fields_are_rejected_without_echoing(self):
        for value in ("private-sentinel", float("nan"), float("inf"), -.1, 2.01, True):
            with self.subTest(value=repr(value)), self.assertRaises(ValueError) as error:
                evaluate([row(values=(value, .1, .1))])
            self.assertNotIn("private-sentinel", str(error.exception))
        for value in (0, -.1, float("nan"), float("inf"), .638, "private-sentinel"):
            with self.subTest(limit=repr(value)), self.assertRaises(ValueError):
                evaluate([row()], value)
        for value in ({**row(), "name": "private-sentinel"}, {**row(), "expected": "private-sentinel"}):
            with self.assertRaises(ValueError) as error:
                evaluate([value])
            self.assertNotIn("private-sentinel", str(error.exception))

    def test_cli_returns_counts_only_and_never_writes_configuration_or_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "anonymous.csv"
            path.write_text("expected,id_to_saved,live_to_saved,live_to_id\nsame,0.01,0.1,0.15\ndifferent,0.01,0.9,0.8\n", encoding="utf-8")
            before = path.read_bytes()
            with redirect_stdout(io.StringIO()) as output:
                self.assertEqual(main([str(path)]), 0)
            self.assertFalse(json.loads(output.getvalue())["validated_for_production"])
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual(list(Path(directory).iterdir()), [path])
            path.write_text("expected,id_to_saved,live_to_saved,live_to_id\nsame,0.01,0.9,0.9\n", encoding="utf-8")
            with redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(path)]), 2)

    def test_cli_errors_do_not_expose_private_headers_paths_or_raw_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "private-path-sentinel.csv"
            for source in ("expected,id_to_saved,live_to_saved,live_to_id,private-header-sentinel\n",
                "expected,id_to_saved,live_to_saved,live_to_id\nsame,private-value-sentinel,0.1,0.1\n"):
                path.write_text(source, encoding="utf-8")
                with redirect_stderr(io.StringIO()) as error, self.assertRaises(SystemExit):
                    main([str(path)])
                for private in ("private-header-sentinel", "private-value-sentinel", "private-path-sentinel"):
                    self.assertNotIn(private, error.getvalue())
            path.unlink()
            with redirect_stderr(io.StringIO()) as error, self.assertRaises(SystemExit):
                main([str(path)])
            self.assertNotIn("private-path-sentinel", error.getvalue())


if __name__ == "__main__":
    unittest.main()
