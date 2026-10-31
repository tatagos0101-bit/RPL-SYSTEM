from datetime import timedelta

import pytest

from models.book import Book
from models.book_copy import BookCopy
from models.transaction import Transaction
from models.user import User
from routers.auth import _make_token
from services.book_copy_service import ensure_book_copies
from timezone_utils import now_ph


@pytest.fixture()
def inventory(client, db_session):
    librarian=User(name="Edit librarian",role="librarian",password_hash="unused-test-hash")
    member=User(name="Edit member",role="member",password_hash="unused-test-hash")
    book=Book(title="Original book",author="Original author",category="History",year=2001,
              isbn="9780000000001",location_shelf="A-1",cover_url="https://example.com/old.png",copies_total=3,copies_available=3)
    db_session.add_all([librarian,member,book])
    db_session.commit()
    ensure_book_copies(db_session,book.id)
    headers={"Authorization":"Bearer "+_make_token(librarian.id)}
    return book,member,headers


def test_edit_changes_metadata_and_can_clear_optional_fields(client,db_session,inventory):
    book,member,headers=inventory
    qr_ids=[(c.id,c.qr_code) for c in book.copies]
    response=client.put(f"/api/inventory/books/{book.id}",headers=headers,json={
        "title":"Updated title","author":"Updated author","category":"Science",
        "year":None,"isbn":None,"location_shelf":None,"cover_url":None,
    })
    assert response.status_code==200
    data=response.json()
    assert (data["title"],data["author"],data["category"])==("Updated title","Updated author","General")
    assert all(data[field] is None for field in ("year","isbn","location_shelf","cover_url"))
    db_session.expire_all()
    assert db_session.get(Book,book.id).raw_api_label == "Science"
    assert [(c.id,c.qr_code) for c in db_session.get(Book,book.id).copies]==qr_ids


def test_resize_preserves_loans_and_retired_qrs_are_not_reused(client,db_session,inventory):
    book,member,headers=inventory
    # Protect the last-numbered copy, so a simple numbering cutoff would be unsafe.
    copies=sorted(book.copies,key=lambda copy:copy.copy_number)
    protected=copies[-1]
    protected.status="borrowed"
    book.copies_available=2
    tx=Transaction(user_id=member.id,book_id=book.id,copy_id=protected.id,type="borrow",status="active",
                   borrow_date=now_ph(),due_date=now_ph()+timedelta(days=14))
    db_session.add(tx)
    db_session.commit()
    response=client.put(f"/api/inventory/books/{book.id}",headers=headers,json={"copies_total":1})
    assert response.status_code==200 and response.json()["copies_available"]==0
    db_session.expire_all()
    assert db_session.get(BookCopy,protected.id).status=="borrowed"
    assert db_session.get(Transaction,tx.id).copy_id==protected.id
    assert db_session.query(BookCopy).filter_by(book_id=book.id,status="retired").count()==2
    response=client.put(f"/api/inventory/books/{book.id}",headers=headers,json={"copies_total":3})
    assert response.status_code==200 and response.json()["copies_available"]==2
    db_session.expire_all()
    active=db_session.query(BookCopy).filter(BookCopy.book_id==book.id,BookCopy.status!="retired").all()
    assert {c.copy_number for c in active}=={3,4,5}
    ensure_book_copies(db_session,book.id)
    assert db_session.query(BookCopy).filter_by(book_id=book.id).count()==5


def test_rejected_reduction_does_not_save_metadata_or_lose_loans(client,db_session,inventory):
    book,member,headers=inventory
    copy=book.copies[0]
    copy.status="borrowed"
    book.copies_available=2
    db_session.commit()
    response=client.put(f"/api/inventory/books/{book.id}",headers=headers,json={"title":"Must not save","copies_total":0})
    assert response.status_code==409
    db_session.expire_all()
    assert db_session.get(Book,book.id).title=="Original book"
    assert db_session.get(Book,book.id).copies_total==3
    assert db_session.get(BookCopy,copy.id).status=="borrowed"


def test_duplicate_isbn_is_rejected_and_original_book_is_preserved(client,db_session,inventory):
    book,member,headers=inventory
    other=Book(title="Other book",author="Other author",category="History",isbn="9780000000002",copies_total=1,copies_available=1)
    db_session.add(other)
    db_session.commit()
    response=client.put(f"/api/inventory/books/{book.id}",headers=headers,json={"isbn":other.isbn,"title":"Must not save"})
    assert response.status_code==409
    db_session.expire_all()
    assert db_session.get(Book,book.id).isbn=="9780000000001"
    assert db_session.get(Book,book.id).title=="Original book"


def test_members_cannot_edit_and_available_counts_cannot_be_forged(client,inventory):
    book,member,headers=inventory
    response=client.put(f"/api/inventory/books/{book.id}",headers={"Authorization":"Bearer "+_make_token(member.id)},json={"title":"Forbidden"})
    assert response.status_code==403
    assert client.put(f"/api/inventory/books/{book.id}",headers=headers,json={"copies_available":999}).status_code==422
    assert client.put(f"/api/inventory/books/{book.id}",headers=headers,json={"title":None}).status_code==422


@pytest.mark.parametrize("field,limit",[("title",255),("author",180),("category",1000),("location_shelf",80)])
def test_edit_lengths_match_postgres_columns(client,inventory,field,limit):
    book,member,headers=inventory
    assert client.put(f"/api/inventory/books/{book.id}",headers=headers,json={field:"X"*(limit+1)}).status_code==422
