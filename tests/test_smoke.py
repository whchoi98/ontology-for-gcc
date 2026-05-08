def test_main_imports():
    from api import main
    assert main.app is not None
