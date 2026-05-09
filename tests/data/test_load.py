import pytest
def test_load_module_imports():
    from data import load
    assert callable(load.main)
