from contextlib import contextmanager
from sqlalchemy import text
from sqlalchemy.orm import Session


@contextmanager
def snapshot(db):
    # Authentication has its own transaction; report rows and their fingerprint
    # must be computed in one consistent database snapshot.
    with db.get_bind().connect() as connection:
        if connection.dialect.name == 'postgresql':
            connection = connection.execution_options(isolation_level='REPEATABLE READ')
        with connection.begin():
            if connection.dialect.name == 'postgresql':
                connection.execute(text('SET TRANSACTION READ ONLY'))
            with Session(bind=connection) as reader:
                yield reader


