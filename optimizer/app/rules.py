import json
import os
from pathlib import Path
from typing import Dict, List, Any

DEFAULT_RULES_PATH = os.environ.get("SHARED_RULES_PATH", "/shared/rules.json")

HOSPITAL_NAMES: Dict[str, str] = {
    "H1": "Pink City General",
    "H2": "Aravali Medical Centre",
    "H3": "Amber Heart Institute",
    "H4": "Sawai Care Hospital",
    "H5": "Rampura Trauma Centre",
}

def load_rules(path: str = DEFAULT_RULES_PATH) -> Dict[str, Any]:
    file_path = Path(path)
    if not file_path.exists():
        # Fallback to relative path from optimizer/app/
        fallback = Path(__file__).resolve().parent.parent.parent / "shared" / "rules.json"
        if fallback.exists():
            file_path = fallback
        else:
            root_fallback = Path(os.getcwd()) / "shared" / "rules.json"
            if root_fallback.exists():
                file_path = root_fallback
            else:
                raise FileNotFoundError(f"Shared rules file not found at {path} or {fallback}")
    
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

RULES = load_rules()

def is_compatible(component: str, donor_group: str, recipient_group: str) -> bool:
    comp_rules = RULES.get("compatibility", {}).get(component, {})
    acceptable_donors = comp_rules.get(recipient_group, [])
    return donor_group in acceptable_donors

def get_safety_margin_minutes() -> int:
    return int(RULES.get("parameters", {}).get("safetyMarginMinutes", 30))

def get_dispatch_buffer_minutes() -> int:
    return int(RULES.get("parameters", {}).get("dispatchBufferMinutes", 15))

def get_shelf_life_days(component: str) -> int:
    return int(RULES.get("shelfLifeDays", {}).get(component, 30))
