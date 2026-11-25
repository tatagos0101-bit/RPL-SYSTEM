# Validating the online ID comparison policy

The operator selected keeping the existing **0.45 maximum cosine distance** on
November 25, 2026. No less strict SFace policy is approved by this document or
the analysis tool. Login, entrance, PAD and duplicate-enrollment rules are unchanged.

A single genuine failed comparison identifies a rejection, not its cause or the
false-acceptance risk of a different threshold. Raw Laplacian sharpness values at
different crop resolutions are not directly comparable evidence of blur. Small
saved ID portraits, age differences, lighting, alignment and camera focus require
controlled evaluation; the numeric report cannot establish which caused a rejection.

## Required operational evidence

Library staff must arrange a separately approved, consented, **read-only** trial
workflow with representative supported IDs, camera devices and lighting. Include
both genuine-person and different-person comparisons, and record **all** outcomes,
including passes, failures and quality/PAD rejections. Keep development/calibration
subjects separate from final evaluation subjects and report repeated captures by
the same participant as correlated observations.

Do not collect negative trials by calling production enrollment: a passing request
stores a facial template. The current enrollment dialog is not a read-only trial
collector. Its failed-attempt reports alone are a selected sample and cannot
measure false acceptance. An authorized read-only collection workflow and actual
consenting participant trials are still required; neither is established by the
synthetic automated tests. No new collection, consent or retention policy is
introduced here.

Process comparison media only inside that approved workflow; do not send ID photos,
camera images, templates, names, contacts or saved-ID references to the assistant,
source control or an external verification service. Do not create a new retained
biometric dataset under the existing discard-after-comparison policy.

## Analyze anonymous scores

`scripts/evaluate_id_face_policy.py` is a standalone, standard-library score
analyzer. It does not load the application, model, environment, database or network,
collect images, enroll faces, write files or change settings. It accepts only:

```csv
expected,id_to_saved,live_to_saved,live_to_id
```

`expected` is `same` or `different`, independently established by supervised staff,
not inferred from the model's decision. Each distance must be finite and within
`[0, 2]`. Export only these four fields from approved read-only comparisons that
passed the original-ID and live-PAD prerequisites. Track rejected prerequisites
and participant/device coverage separately without exporting personal data.
The score analysis is conditional on those prerequisites; it does not estimate
the safety or completion rate of the entire registration workflow.

From the repository root, using the installed Python runtime:

```powershell
backend/.venv/Scripts/python.exe scripts/evaluate_id_face_policy.py PATH_TO_ANONYMOUS_SCORES.csv
```

The analyzer applies the unchanged strict `< 0.45` rule to **all three** distances
and prints aggregate true accepts, false rejects, false accepts and true rejects.
Rates and Wilson 95% intervals are descriptive; the intervals assume independent
trials and do not correct participant correlation or selection bias. Zero observed
errors does not mean zero risk. Missing genuine/different-person coverage yields
exit status 2 and undefined corresponding rates. Both labels yield status 0 for
successful analysis, **not** approval. `validated_for_production` is always false.

Do not choose a threshold to pass one person's sample. Staff must review held-out
results, minimum error requirements and failure handling before separately
approving any setting change. Password sign-in and supervised librarian face
enrollment remain available while online matching cannot establish identity.

See [the online enrollment workflow](REMOTE_FACE_ENROLLMENT.md) and
[the model provenance and limits](../backend/assets/identity_face/README.md).
