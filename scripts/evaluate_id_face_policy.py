"""Analyze anonymous comparison scores only; no images, models, accounts or network."""
import argparse
import csv
import json
import math
from pathlib import Path


FIELDS = ("expected", "id_to_saved", "live_to_saved", "live_to_id")
REFERENCE_MAX_DISTANCE = 1.0 - .363


def _limit(value):
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise ValueError("Maximum distance must be a finite number in (0, 0.637].") from None
    if not math.isfinite(result) or not 0 < result <= REFERENCE_MAX_DISTANCE:
        raise ValueError("Maximum distance must be a finite number in (0, 0.637].")
    return result


def _rate(errors, total):
    return errors / total if total else None


def _wilson(errors, total):
    """95% interval under independent-trial assumptions, not a safety certification."""
    if not total:
        return None
    z = 1.959963984540054
    proportion = errors / total
    denominator = 1 + z * z / total
    center = (proportion + z * z / (2 * total)) / denominator
    radius = z * math.sqrt(proportion * (1 - proportion) / total + z * z / (4 * total * total)) / denominator
    return [max(0.0, center - radius), min(1.0, center + radius)]


def evaluate(rows, maximum_distance=.45):
    maximum_distance = _limit(maximum_distance)
    counts = {"genuine_trials": 0, "different_person_trials": 0,
        "true_accepts": 0, "false_rejects": 0, "false_accepts": 0, "true_rejects": 0}
    for index, row in enumerate(rows, 1):
        if index > 100_000 or set(row) != set(FIELDS) or row["expected"] not in {"same", "different"}:
            raise ValueError(f"Invalid anonymous score row {index}; use only the documented fields and labels.")
        try:
            if any(isinstance(row[field], bool) for field in FIELDS[1:]):
                raise ValueError
            distances = [float(row[field]) for field in FIELDS[1:]]
            if any(not math.isfinite(value) or not 0 <= value <= 2 for value in distances):
                raise ValueError
        except (TypeError, ValueError):
            raise ValueError(f"Invalid cosine distance in row {index}; values must be finite and within [0, 2].") from None
        # Matches the server's strict comparison boundary and all three checks.
        accepted = all(value < maximum_distance for value in distances)
        if row["expected"] == "same":
            counts["genuine_trials"] += 1
            counts["true_accepts" if accepted else "false_rejects"] += 1
        else:
            counts["different_person_trials"] += 1
            counts["false_accepts" if accepted else "true_rejects"] += 1
    genuine, different = counts["genuine_trials"], counts["different_person_trials"]
    return {"purpose": "offline_score_analysis_only", "maximum_distance": maximum_distance,
        "coverage": "both_labels" if genuine and different else "incomplete",
        "counts": counts,
        "false_acceptance_rate": _rate(counts["false_accepts"], different),
        "false_rejection_rate": _rate(counts["false_rejects"], genuine),
        "false_acceptance_wilson_95": _wilson(counts["false_accepts"], different),
        "false_rejection_wilson_95": _wilson(counts["false_rejects"], genuine),
        "validated_for_production": False,
        "limitations": "Requires representative, independently reviewed held-out trials, including passes and failures. Repeated captures of one person are not independent subjects. No automatic policy approval or configuration changes."}


def read_scores(path):
    if path.stat().st_size > 4 * 1024 * 1024:
        raise ValueError("Anonymous score file must be under 4 MiB.")
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None or len(reader.fieldnames) != len(FIELDS) or set(reader.fieldnames) != set(FIELDS):
            raise ValueError("Use exactly the four documented anonymous score columns; identity/image fields are not accepted.")
        return evaluate(reader)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scores", type=Path, help="CSV with expected,id_to_saved,live_to_saved,live_to_id")
    args = parser.parse_args(argv)
    try:
        result = read_scores(args.scores)
    except (OSError, UnicodeError, csv.Error):
        parser.error("The anonymous score file could not be read; no file path or contents were logged.")
    except ValueError as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2))
    return 0 if result["coverage"] == "both_labels" else 2


if __name__ == "__main__":
    raise SystemExit(main())
