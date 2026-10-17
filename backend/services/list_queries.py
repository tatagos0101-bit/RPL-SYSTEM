from sqlalchemy import or_
from fastapi import HTTPException
from models.user import User
from models.book import Book
from models.transaction import Transaction


def member_query(db, search='', status=''):
    if status and status not in ('active', 'suspended'):
        raise HTTPException(400, "Status filter must be 'active' or 'suspended'")
    query = db.query(User).filter(User.role == 'member')
    if status:
        query = query.filter(User.status == status)
    if search:
        like = f'%{search}%'
        terms = [User.name.ilike(like), User.email.ilike(like), User.member_id.ilike(like), User.phone.ilike(like)]
        if search.isdigit():
            terms.append(User.id == int(search))
        query = query.filter(or_(*terms))
    return query


def transaction_query(db, search='', type='', status=''):
    if type and type not in ('borrow', 'return'):
        raise HTTPException(400, "Type filter must be 'borrow' or 'return'")
    if status and status not in ('active', 'returned', 'overdue'):
        raise HTTPException(400, "Status filter must be 'active', 'returned', or 'overdue'")
    query = db.query(Transaction)
    if type:
        query = query.filter(Transaction.type == type)
    if status:
        query = query.filter(Transaction.status == status)
    if search:
        like = f'%{search}%'
        query = query.join(User).join(Book).filter(or_(User.name.ilike(like), User.member_id.ilike(like), Book.title.ilike(like)))
    return query
