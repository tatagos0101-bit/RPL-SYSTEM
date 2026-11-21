# Updated system flowcharts

Source-reviewed edition: 17 November 2026.

The collection contains **29 diagrams across 28 numbered topics**. Sections
2.3.1-2.3.9 cover the requested flows; borrowing and returning are separated as
2.3.7a and 2.3.7b. Sections 2.3.10-2.3.28 cover registration, recovery, profile
management, email verification, reservation lifecycle, inventory and imports,
member administration, enrollment, recommendations, activity, notifications,
copy labels, settings, acquisition records, navigation, write recovery, and
category review.

- [Editable Mermaid diagrams, descriptions, and source references](RPL_System_Flowcharts.md)
- [Structured diagram definitions](flowcharts.json)
- [Complete PDF](../../output/pdf/RPL_System_Flowcharts.pdf)
- [PNG, SVG, and editable-source archive](../../output/flowcharts/RPL_System_Flowchart_Images_and_Sources.zip)

Generated deliverables under `output/` are local artifacts and are ignored by
Git. Their links work in the working copy after generation; that output is not
automatically included in a repository clone.

## Corrections to the previous descriptions

- Current account login supports passwords and optional enrolled Face ID. The
  website registers members through librarians, and stored roles are member and
  librarian.
- Reservation confirmation does not require a camera scan. Physical pickup uses
  librarian identification with Face ID or supervised manual ID.
- The five-book allowance combines active/overdue loans and pending/ready
  reservations; a local selection consumes no stock.
- Ready reservation borrowing offers automatic exact-copy selection through
  Add to list. QR/manual entry remains available for walk-ins and optional scans.
- Attendance is a separate PIN-controlled entrance-station workflow. It does not
  issue account login sessions or provide a payroll module.
- Member names are locked. Profile photos and registration ID uploads are
  optional. Email/SMS registration delivery depends on configured providers;
  provider acceptance does not prove receipt.
- Personal transcripts have an owner-scoped API, but the current member pages
  do not show a transcript download control. The diagram labels that branch as
  a service request.
- Acquisition metadata depends on the separate reporting schema. These
  diagrams describe source behavior, not confirmation of every live integration.

The source files are cited beside each editable diagram. No production records,
private images, secrets, or biometric data are used. No application behavior was
changed. Verification covers source references, diagram connectivity, searchable
PDF labels, page boundaries, and visual inspection of all rendered pages.
