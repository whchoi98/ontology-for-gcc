from data.real._common import normalize_cust_id, normalize_dt, merge_dt_time


def test_normalize_cust_id_strips_whitespace():
    assert normalize_cust_id(' c001  ') == 'c001'


def test_normalize_cust_id_treats_null_as_empty():
    assert normalize_cust_id('NULL') == ''
    assert normalize_cust_id('00000000') == ''
    assert normalize_cust_id('') == ''


def test_normalize_dt_treats_zero_as_none():
    assert normalize_dt('00000000') is None
    assert normalize_dt('20260501') == '20260501'


def test_normalize_dt_strips_separators():
    assert normalize_dt('2026-05-01') == '20260501'


def test_merge_dt_time_iso_kst():
    assert merge_dt_time('20260501', '142530') == '2026-05-01T14:25:30+09:00'
    assert merge_dt_time('20260501', None) == '2026-05-01T00:00:00+09:00'
    assert merge_dt_time(None, '142530') is None
