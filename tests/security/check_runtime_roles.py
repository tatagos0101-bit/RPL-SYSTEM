"""Privilege drift checks using only the disposable PostgreSQL fixture."""
from pathlib import Path


def verify_runtime_role_checks(admin, runtime, psycopg, sql):
    root = Path(__file__).resolve().parents[2]
    verifier = (root / "supabase/operations/check_runtime_access.sql").read_text()
    audit = (root / "supabase/operations/audit_runtime_identity.sql").read_text()

    def results(statement):
        cursor = runtime.execute(statement)
        rows = []
        while True:
            if cursor.description:
                names = [column.name for column in cursor.description]
                rows.extend(dict(zip(names, row)) for row in cursor.fetchall())
            if not cursor.nextset():
                break
        return rows

    def failure(field):
        assert any(row.get(field) is False for row in results(verifier)), field

    def healthy():
        rows = results(verifier)
        assert len(rows) == 17
        assert all(value is True for row in rows for key, value in row.items() if key != "table_name")

    healthy()
    identity, tables = results(audit)
    assert identity["read_only_transaction"] and identity["runtime_group_inherited"]
    assert not identity["superuser"] and not identity["bypasses_rls"]
    assert identity["extra_role_membership_count"] == 0
    assert tables["present_application_table_count"] == 16
    assert tables["missing_application_table_count"] == 0
    assert tables["missing_live_baseline_table_count"] == 0
    assert tables["owned_application_table_count"] == 0
    assert tables["tables_enforcing_runtime_rls_count"] == 16
    assert tables["anonymous_accessible_table_count"] == 0
    admin.execute("REVOKE USAGE ON SEQUENCE public.books_id_seq FROM rpl_app_runtime")
    try:
        failure("required_sequence_access")
    finally:
        admin.execute("GRANT USAGE ON SEQUENCE public.books_id_seq TO rpl_app_runtime")
    try:
        runtime.execute("SELECT setval('public.books_id_seq', 1000)")
    except psycopg.errors.InsufficientPrivilege:
        pass
    else:
        raise AssertionError("Runtime must not reset sequences")
    admin.execute("GRANT UPDATE ON SEQUENCE public.books_id_seq TO rpl_app_runtime")
    try:
        failure("cannot_reset_or_delegate_sequence")
    finally:
        admin.execute("REVOKE UPDATE ON SEQUENCE public.books_id_seq FROM rpl_app_runtime")
    admin.execute("CREATE ROLE rpl_security_extra NOLOGIN; GRANT rpl_security_extra TO rpl_security_login WITH INHERIT FALSE")
    try:
        failure("no_extra_role_memberships")
    finally:
        admin.execute("REVOKE rpl_security_extra FROM rpl_security_login; DROP ROLE rpl_security_extra")
    admin.execute("GRANT rpl_app_runtime TO rpl_security_login WITH ADMIN OPTION")
    try:
        failure("cannot_delegate_roles")
    finally:
        admin.execute("REVOKE ADMIN OPTION FOR rpl_app_runtime FROM rpl_security_login")
    admin.execute("GRANT SELECT ON public.books TO rpl_security_login WITH GRANT OPTION")
    try:
        failure("cannot_delegate_table_access")
    finally:
        admin.execute("REVOKE SELECT ON public.books FROM rpl_security_login")
    admin.execute("GRANT TRIGGER ON public.books TO rpl_app_runtime")
    try:
        failure("no_extra_table_privileges")
    finally:
        admin.execute("REVOKE TRIGGER ON public.books FROM rpl_app_runtime")
    admin.execute("ALTER TABLE public.library_settings OWNER TO rpl_app_runtime")
    try:
        failure("runtime_is_not_owner")
        failure("runtime_subject_to_rls")
    finally:
        admin.execute("ALTER TABLE public.library_settings OWNER TO postgres")
        admin.execute("GRANT SELECT,INSERT,UPDATE,DELETE ON public.library_settings TO rpl_app_runtime")
    admin.execute("ALTER ROLE rpl_security_login CREATEDB")
    try:
        failure("restricted_role_attributes")
    finally:
        admin.execute("ALTER ROLE rpl_security_login NOCREATEDB")
    admin.execute("ALTER TABLE public.inventory_writes RENAME TO synthetic_hidden_inventory_writes")
    try:
        failure("required_tables_present")
    finally:
        admin.execute("ALTER TABLE public.synthetic_hidden_inventory_writes RENAME TO inventory_writes")
    healthy()
    print("PASS: metadata audit and verifier reject missing/excess sequence grants, non-inherited memberships, delegation, extra table grants, inherited ownership and elevated attributes")
