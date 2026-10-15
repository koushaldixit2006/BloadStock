import pytest
from app.rules import is_compatible, RULES

ALL_GROUPS = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"]
COMPONENTS = ["RED_CELLS", "PLATELETS", "PLASMA"]

def test_rules_json_contains_all_components_and_groups():
    assert "compatibility" in RULES
    for comp in COMPONENTS:
        assert comp in RULES["compatibility"]
        for group in ALL_GROUPS:
            assert group in RULES["compatibility"][comp]

def test_red_cells_compatibility():
    # O- is universal donor for RED_CELLS
    for recipient in ALL_GROUPS:
        assert is_compatible("RED_CELLS", "O-", recipient) is True

    # AB+ is universal recipient for RED_CELLS
    for donor in ALL_GROUPS:
        assert is_compatible("RED_CELLS", donor, "AB+") is True

    # Rh- recipients cannot receive Rh+ red cells
    for donor in ["O+", "A+", "B+", "AB+"]:
        for recipient in ["O-", "A-", "B-", "AB-"]:
            assert is_compatible("RED_CELLS", donor, recipient) is False

def test_plasma_compatibility():
    # AB is universal donor for PLASMA (Rh ignored in synthetic rules)
    for recipient in ALL_GROUPS:
        assert is_compatible("PLASMA", "AB+", recipient) is True
        assert is_compatible("PLASMA", "AB-", recipient) is True

    # O is universal recipient for PLASMA
    for donor in ALL_GROUPS:
        assert is_compatible("PLASMA", donor, "O-") is True
        assert is_compatible("PLASMA", donor, "O+") is True

    # AB recipient can only receive AB plasma
    for donor in ["O-", "O+", "A-", "A+", "B-", "B+"]:
        assert is_compatible("PLASMA", donor, "AB+") is False
        assert is_compatible("PLASMA", donor, "AB-") is False

def test_platelets_compatibility():
    # ABO-identical for PLATELETS (Rh ignored)
    for group1 in ["O-", "O+"]:
        for group2 in ["O-", "O+"]:
            assert is_compatible("PLATELETS", group1, group2) is True

    for group1 in ["A-", "A+"]:
        for group2 in ["A-", "A+"]:
            assert is_compatible("PLATELETS", group1, group2) is True

    # Different ABO is incompatible for platelets
    assert is_compatible("PLATELETS", "O+", "A+") is False
    assert is_compatible("PLATELETS", "B+", "AB+") is False
    assert is_compatible("PLATELETS", "A-", "B-") is False
