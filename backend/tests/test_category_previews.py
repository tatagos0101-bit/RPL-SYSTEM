"""Synthetic public artwork only; no private uploads or patron records."""
from sqlalchemy import event

from models.book import Book


def book(db, title, category="General", cover=None, hidden=False):
    row=Book(title=title,author="Synthetic Author",category=category,cover_url=cover,is_hidden=hidden,copies_total=1,copies_available=1)
    db.add(row)
    db.flush()
    return row


def categories(client, **params):
    response=client.get("/api/books/categories",params=params)
    assert response.status_code==200
    return response.json()


def test_default_category_contract_is_unchanged(client,db_session):
    book(db_session,"Synthetic",cover="/uploads/covers/synthetic.png")
    db_session.commit()
    assert categories(client)==[{"category":"General","count":1}]


def test_previews_are_per_category_bounded_and_stable(client,db_session):
    rows=[book(db_session,f"Title {i}",category="History",cover=f"/uploads/covers/h-{i}.png") for i in range(5)]
    fantasy=book(db_session,"A fantasy title",category="Fantasy",cover="/uploads/covers/f.png")
    book(db_session,"No cover",category="Empty Art")
    db_session.commit()
    data={row["category"]:row for row in categories(client,include_previews=True)}
    assert data["History"]["count"]==5
    assert data["History"]["preview_covers"]==[{"id":r.id,"cover_url":r.cover_url} for r in rows[:3]]
    assert data["Fantasy"]["preview_covers"]==[{"id":fantasy.id,"cover_url":fantasy.cover_url}]
    assert data["Empty Art"]["preview_covers"]==[]
    assert categories(client,include_previews=True)==categories(client,include_previews=True,category="Fantasy",search="No cover",skip=100)


def test_no_empty_or_hidden_art_and_general_visibility_is_preserved(client,db_session):
    book(db_session,"A empty cover",category="History",cover="")
    book(db_session,"B whitespace cover",category="History",cover="   ")
    hidden=book(db_session,"Hidden History",category="History",cover="/uploads/covers/hidden.png",hidden=True)
    shown=book(db_session,"Shown History",category="History",cover="/uploads/covers/shown.png")
    general=book(db_session,"Legacy General",cover="/uploads/covers/general.png",hidden=True)
    book(db_session,"Only hidden",category="Secret",cover="/uploads/covers/secret.png",hidden=True)
    db_session.commit()
    data={row["category"]:row for row in categories(client,include_previews=True)}
    assert "Secret" not in data
    assert data["History"]["preview_covers"]==[{"id":shown.id,"cover_url":shown.cover_url}]
    assert all(item["id"]!=hidden.id for row in data.values() for item in row["preview_covers"])
    assert data["General"]["preview_covers"]==[{"id":general.id,"cover_url":general.cover_url}]


def test_rare_genre_beyond_first_page_still_has_preview_without_n_plus_one(client,db_session):
    for i in range(105):book(db_session,f"A popular {i:03d}",cover=f"/uploads/covers/a-{i}.png")
    rare=book(db_session,"Z rare",category="Rare Genre",cover="/uploads/covers/z.png")
    db_session.commit()
    statements=[]
    def capture(conn,cursor,statement,parameters,context,executemany):
        if statement.lstrip().upper().startswith("SELECT"):statements.append(statement)
    engine=db_session.get_bind()
    event.listen(engine,"before_cursor_execute",capture)
    try:data={row["category"]:row for row in categories(client,include_previews=True)}
    finally:event.remove(engine,"before_cursor_execute",capture)
    assert data["Rare Genre"]["preview_covers"]==[{"id":rare.id,"cover_url":rare.cover_url}]
    assert sum(len(row["preview_covers"]) for row in data.values())==4
    assert len(statements)<=2


def test_empty_inventory_and_invalid_preview_flag(client):
    assert categories(client,include_previews=True)==[]
    assert client.get("/api/books/categories",params={"include_previews":"invalid"}).status_code==422
