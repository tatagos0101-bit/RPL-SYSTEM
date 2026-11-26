"""Plain-language report labels shared by the preview and downloaded reports."""
RECORD_LABELS = {
    "visits": "Number of visitor entries", "patrons": "Number of member accounts",
    "circulation": "Number of loan records", "collection": "Number of inventory records",
    "acquisitions": "Number of acquisition records", "inventory": "Number of catalog titles",
}
SUMMARY_LABELS = {
    "identified_unique_visitors": "Number of identified individual visitors",
    "unidentified_visits": "Visitor entries without an identified person",
    "returning_visitors": "Number of returning identified visitors",
    "first_recorded_visitors": "Number of first-recorded identified visitors",
    "average_visits_per_calendar_day": "Average visitor entries per day",
    "previous_period_visits": "Visitor entries in the previous period",
    "visits_change_percent": "Change in visitor entries (%)",
    "borrows": "Number of books borrowed", "returns": "Number of books physically returned",
    "reported_lost": "Number of loans closed as lost", "damaged_returns": "Number of damaged returns",
    "assessed_charges": "Total assessed charges (PHP)",
    "on_time_returns": "Number of books returned on time", "late_returns": "Number of late returns",
    "average_loan_days": "Average borrowing duration (days)",
    "excluded_duration_rows": "Returns excluded from the duration calculation",
    "unknown_due_date_returns": "Returns with no recorded due date",
    "borrowed_in_period": "Members who borrowed during this period",
    "visited_in_period": "Members who visited during this period",
    "registrations_in_period": "New member registrations during this period",
    "titles": "Number of catalog titles", "physical_copy_records": "Number of physical-copy records",
    "current_holdings": "Number of copies currently held", "retired": "Number of retired copies",
    "coverage_copies": "Number of copies checked for acquisition details",
    "coverage_unknown_source": "Copies with no recorded acquisition source",
    "coverage_unknown_date": "Copies with no recorded acquisition date",
    "recorded_cost_by_currency": "Recorded acquisition costs by currency",
    "discrepant_titles": "Titles with inventory count discrepancies",
    "catalog_total": "Total copies recorded in the catalog",
    "physical_total": "Total physical-copy records", "catalog_available": "Available copies in the catalog",
    "physical_available": "Available physical-copy records",
    "current_overdue_fines": "Current overdue fines (PHP)",
}
CHART_LABELS = {
    "visitors": ("Date", "Number of visitor entries"),
    "hours": ("Hour (Philippine time)", "Number of visitor entries"),
    "days": ("Day of the week", "Number of visitor entries"),
    "borrows": ("Date", "Number of books borrowed"), "returns": ("Date", "Number of books returned"),
    "categories": ("Book category", "Number of books borrowed"),
    "titles": ("Book title", "Number of books borrowed"), "authors": ("Author", "Number of books borrowed"),
    "registrations": ("Registration date", "Number of member accounts"),
    "accounts": ("Account status", "Number of member accounts"),
    "borrowers": ("Member ID", "Number of books borrowed"),
    "statuses": ("Copy status", "Number of physical copies"),
    "category-copies": ("Book category", "Number of physical copies"),
    "category-titles": ("Book category", "Number of catalog titles"),
    "popular-categories": ("Book category", "Number of books borrowed"),
    "least-categories": ("Book category", "Number of books borrowed"),
    "most": ("Book title", "Number of books borrowed"), "least": ("Book title", "Number of books borrowed"),
    "source": ("Acquisition source", "Number of copies acquired"),
    "acquired": ("Month", "Number of copies acquired"),
    "acquisition-category": ("Book category", "Number of copies acquired"),
    "discrepancies": ("Inventory check result", "Number of catalog titles"),
}


def summary_labels(summary, category):
    return {key: RECORD_LABELS.get(category, "Number of matching records") if key == "matching_records"
        else SUMMARY_LABELS.get(key, key.replace("_", " ").capitalize()) for key in summary}


def column_label(key):
    return {"visited": "Visit time-in", "departed": "Visit time-out", "borrowed": "Borrowed on",
        "id": "Record ID", "book_id": "Catalog book ID", "member_id": "Member ID",
        "isbn": "ISBN", "copy_qr": "Physical-copy QR code", "borrowable": "Can be borrowed",
        "returned": "Returned / closed on", "due": "Due on", "registered": "Registered on",
        "visits": "Number of visitor entries", "borrows": "Number of books borrowed",
        "title_borrows": "Number of loans for this title", "title_borrowers": "Number of borrowers for this title",
        "distinct_borrowers_in_period": "Number of individual borrowers in the period",
        "declared_copies": "Copies recorded in the catalog", "physical_copies": "Number of physical copies held",
        "declared_available": "Available copies in the catalog", "available": "Available physical copies",
        "borrowed_copies": "Number of physical copies on loan", "outstanding_loans": "Number of unclosed loans",
        "damaged_copies": "Number of damaged copies", "lost_copies": "Number of lost copies",
        "discrepancy": "Inventory discrepancy (1 = needs review)",
        "late_fee": "Late fee (PHP)", "damage_loss_fee": "Damage / loss assessment (PHP)",
        "assessed_charges": "Total assessed charges (PHP)"}.get(key, key.replace("_", " ").capitalize())
