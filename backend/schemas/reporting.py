from schemas.acquisition import AcquisitionDetails
from datetime import date
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ReportFilters(BaseModel):
    model_config = ConfigDict(extra='forbid')
    category: Literal['visits', 'patrons', 'circulation', 'collection', 'acquisitions', 'inventory'] = 'circulation'
    start: date
    end: date
    period: Literal['today', 'yesterday', 'week', 'last-week', 'month', 'last-month', 'quarter', 'year', 'last-year', 'custom'] = 'custom'
    group: Literal['day', 'week', 'month', 'year'] = 'month'
    query: str = Field('', max_length=200)
    date_basis: Literal['activity', 'borrowed', 'returned', 'due', 'registered', 'added', 'acquired'] = 'activity'
    book_category: str = Field('', max_length=80)
    author: str = Field('', max_length=180)
    isbn: str = Field('', max_length=20)
    qr: str = Field('', max_length=40)
    shelf: str = Field('', max_length=80)
    year_from: int | None = Field(None, ge=0, le=9999)
    year_to: int | None = Field(None, ge=0, le=9999)
    member_id: str = Field('', max_length=20)
    account_status: Literal['', 'active', 'suspended'] = ''
    participation: Literal['', 'borrowed', 'visited', 'neither'] = ''
    loan_status: Literal['', 'outstanding', 'overdue', 'returned', 'on-time', 'late'] = ''
    holdings: Literal['all', 'current'] = 'all'
    copy_status: Literal['', 'available', 'borrowed', 'damaged', 'lost', 'retired'] = ''
    source: Literal['', 'unknown', 'purchased', 'donated', 'other'] = ''
    date_scope: Literal['period', 'all', 'unknown'] = 'period'
    party: str = Field('', max_length=180)
    recorded_by: int | None = Field(None, gt=0)
    sort: str = Field('id', max_length=40)
    direction: Literal['asc', 'desc'] = 'desc'

    @model_validator(mode='after')
    def validate_range(self):
        if self.end < self.start or (self.end - self.start).days > 3660 or self.end.year >= 9999 or self.start.year < 1901:
            raise ValueError('Choose a valid period no longer than ten years.')
        if self.period in ('month', 'last-month', 'quarter', 'year', 'last-year'):
            import calendar
            months = 12 if self.period in ('year', 'last-year') else 3 if self.period == 'quarter' else 1
            if (months == 12 and self.start.month != 1) or (months == 3 and self.start.month not in (1,4,7,10)):
                raise ValueError('Choose a calendar year or quarter boundary.')
            last_month = self.start.month + months - 1
            if self.start.day != 1 or last_month > 12 or self.end != date(self.start.year, last_month, calendar.monthrange(self.start.year, last_month)[1]):
                raise ValueError('Preset periods must use complete calendar boundaries; use custom for other ranges.')
        if self.date_scope == 'unknown' and self.category != 'acquisitions':
            raise ValueError('Unknown date applies only to acquisitions.')
        if self.category == 'circulation' and self.date_basis not in ('activity', 'borrowed', 'returned', 'due'):
            raise ValueError('Choose a circulation date basis.')
        if self.category != 'circulation' and self.date_basis not in ('activity', {'patrons': 'registered', 'collection': 'added', 'acquisitions': 'acquired'}.get(self.category)):
            raise ValueError('Date basis is not applicable to this category.')
        if self.year_from is not None and self.year_to is not None and self.year_to < self.year_from:
            raise ValueError('Publication year range is reversed.')
        book_fields = ['book_category', 'author', 'isbn', 'qr', 'shelf', 'year_from', 'year_to']
        allowed = {
            'visits': ['member_id'],
            'patrons': ['member_id', 'account_status', 'participation', 'date_scope'],
            'circulation': book_fields + ['member_id', 'loan_status'],
            'collection': book_fields + ['copy_status', 'date_scope'],
            'acquisitions': book_fields + ['source', 'date_scope', 'party', 'recorded_by'],
            'inventory': book_fields,
        }[self.category]
        for field in book_fields + ['member_id', 'account_status', 'participation', 'loan_status', 'copy_status', 'source', 'party', 'recorded_by']:
            if getattr(self, field) not in ('', None) and field not in allowed:
                raise ValueError(f'{field} is not a filter for {self.category}.')
        if self.category not in ('collection', 'patrons', 'acquisitions') and self.date_scope != 'period':
            raise ValueError('Date scope is not a filter for this category.')
        if self.category != 'collection' and self.holdings != 'all':
            raise ValueError('Holdings filters apply only to collection reports.')
        return self


class ReportRequest(BaseModel):
    filters: ReportFilters
    page: int = Field(0, ge=0)
    page_size: int = Field(25, ge=1, le=100)
    context: str | None = Field(None, max_length=2000)


class ReportExport(ReportRequest):
    format: Literal['csv', 'xlsx', 'pdf', 'print']
    scope: Literal['all', 'summary', 'page'] = 'all'


class AcquisitionInput(AcquisitionDetails):
    copy_id: int = Field(gt=0)
    expected_version: str | None = Field(None, max_length=80)


class AcquisitionBatch(BaseModel):
    rows: list[AcquisitionInput] = Field(min_length=1, max_length=500)
    preview_token: str | None = Field(None, max_length=2000)
