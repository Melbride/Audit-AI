import os
import json
import pandas as pd
from difflib import SequenceMatcher
import re
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
client = Groq(api_key=os.environ.get("GROQ_API_KEY2"))

# Fixed list of standard account categories
STANDARD_ACCOUNT_CATEGORIES = {
    "Cash & Cash Equivalents": "debit",
    "Trade Receivables": "debit",
    "Inventory": "debit",
    "Other Current Asset": "debit",
    "Fixed Asset": "debit",
    "Trade Payables": "credit",
    "Current Liability": "credit",
    "Long-term Liability": "credit",
    "Share Capital": "credit",
    "Retained Earnings": "credit",
    "Unrestricted Net Assets": "credit",
    "Restricted Net Assets": "credit",
    "Revenue": "credit",
    "Other Income": "credit",
    "Cost of Sales": "debit",
    "Operating Expense": "debit",
    "Administrative Expense": "debit",
    "Finance Cost": "debit",
}

def infer_category_direction(category: str) -> str | None:
    """
    Infers normal balance direction (debit or credit) for standard
    and custom user categories.
    """
    if not category:
        return None
        
    # Check standard dictionary first
    if category in STANDARD_ACCOUNT_CATEGORIES:
        return STANDARD_ACCOUNT_CATEGORIES[category]
        
    cat_lower = category.lower()
    
    # Generic credit indicators
    credit_keywords = ['asset', 'equity', 'capital', 'retained', 'earning', 'revenue', 'income', 'payable', 'liability', 'reserve', 'fund']
    debit_keywords = ['cash', 'receivable', 'inventory', 'asset', 'expense', 'cost', 'fee', 'draw', 'loss']
    
    if any(k in cat_lower for k in ['payable', 'liability', 'equity', 'capital', 'retained', 'revenue', 'income', 'reserve', 'fund']):
        return "credit"
    if any(k in cat_lower for k in ['cash', 'receivable', 'inventory', 'asset', 'expense', 'cost', 'loss']):
        return "debit"
        
    return None

def check_balance_direction_mismatch(account_name: str, category: str, debit_total: float, credit_total: float) -> str | None:
    """
    Check if the account's actual debit/credit balance matches what is normally
    expected for its assigned category (works for custom categories too).
    """
    expected_direction = infer_category_direction(category)
    if expected_direction is None:
        return None
        
    actual_direction = "debit" if debit_total > credit_total else "credit"
    
    if actual_direction != expected_direction:
        return (
            f"'{account_name}' is classified as '{category}', which usually has a "
            f"{expected_direction} balance, but this account currently shows a "
            f"{actual_direction} balance. Please confirm this classification is correct."
        )
    return None

def classify_accounts_with_llm(account_names: list) -> dict:
    if not account_names:
        return {}
    categories_list = list(STANDARD_ACCOUNT_CATEGORIES.keys())
    classification = {}
    
    batch_size = 12
    for i in range(0, len(account_names), batch_size):
        batch = account_names[i:i + batch_size]
        prompt = f"""You are a financial accounting expert helping an audit firm classify accounts.
Here are the standard financial statement categories to choose from:
{json.dumps(categories_list)}

Here are the unique account names from the client's trial balance:
{json.dumps(batch)}

Instructions:
- For each account name, suggest the ONE category from the list above that fits it
- Use standard account knowledge and best practices to make your suggestions
- If you genuinely cannot determine a fitting category, use "unknown" for that account
- Return ONLY a valid JSON object mapping each account name to its category
- No text before or after, no markdown, no backticks

EXAMPLE output format:
{{"Cash at Bank": "Cash & Cash Equivalents", "Sales Revenue": "Revenue", "Mystery Account XYZ": "unknown"}}"""

        try:
            response = client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a financial account classification assistant. You only return valid JSON. No explanations, no markdown, no backticks."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0,
                max_tokens=2000,
            )
            raw = response.choices[0].message.content.strip()
            raw = raw.replace("```json", "").replace("```", "").strip()
            batch_classification = json.loads(raw)
            classification.update(batch_classification)
        except Exception:
            pass

    for name in account_names:
        if name not in classification:
            classification[name] = "unknown"
            
    return classification

def find_near_duplicate_accounts(account_names: list) -> list:
    SIMILARITY_THRESHOLD = 0.90
    duplicates = []
    already_flagged = set()

    unique_names = sorted(set(str(n).strip() for n in account_names if str(n).strip()))

    if len(unique_names) < 2 or len(unique_names) > 200:
        return duplicates

    for i in range(len(unique_names)):
        for j in range(i + 1, len(unique_names)):
            val_a, val_b = unique_names[i], unique_names[j]
            if val_a in already_flagged or val_b in already_flagged:
                continue

            base_a = re.sub(r'\d+$', '', val_a).strip()
            base_b = re.sub(r'\d+$', '', val_b).strip()
            if base_a == base_b and val_a != val_b:
                continue

            skip_as_distinct = False
            if val_a.lower() in val_b.lower():
                added_part = val_b.lower().replace(val_a.lower(), "", 1).strip()
                if len(added_part) > 3:
                    skip_as_distinct = True
            elif val_b.lower() in val_a.lower():
                added_part = val_a.lower().replace(val_b.lower(), "", 1).strip()
                if len(added_part) > 3:
                    skip_as_distinct = True

            if skip_as_distinct:
                continue

            similarity = SequenceMatcher(None, val_a.lower(), val_b.lower()).ratio()
            if not (SIMILARITY_THRESHOLD <= similarity < 1.0):
                continue

            tokens_a = set(val_a.lower().split())
            tokens_b = set(val_b.lower().split())
            only_in_a = tokens_a - tokens_b
            only_in_b = tokens_b - tokens_a
            differing = only_in_a | only_in_b
            if differing and all(len(t) >= 4 for t in differing) and only_in_a and only_in_b:
                token_pairs_are_typos = any(
                    SequenceMatcher(None, ta, tb).ratio() >= 0.85
                    for ta in only_in_a for tb in only_in_b
                )
                if not token_pairs_are_typos:
                    continue

            duplicates.append({
                "account_a": val_a,
                "account_b": val_b,
                "message": (
                    f"'{val_a}' and '{val_b}' look like they may be the same "
                    f"account recorded inconsistently. Consider standardizing "
                    f"to one name so their balances are combined correctly in "
                    f"the financial statements."
                ),
            })
            already_flagged.add(val_a)
            already_flagged.add(val_b)

    return duplicates

def build_account_mapping_result(df: pd.DataFrame, mapping: dict, saved_account_mapping: dict = None) -> dict:
    field_alternatives = {
        "account_name": ["account_name", "account_description"],
        "debit": ["debit", "debit_amount"],
        "credit": ["credit", "credit_amount"],
    }
    
    account_name_col = None
    debit_col = None
    credit_col = None

    for info in mapping.values():
        if isinstance(info, dict):
            mapped_to = info.get("mapped_to")
            if mapped_to in field_alternatives["account_name"]:
                account_name_col = mapped_to
            elif mapped_to in field_alternatives["debit"]:
                debit_col = mapped_to
            elif mapped_to in field_alternatives["credit"]:
                credit_col = mapped_to

    if not account_name_col or not debit_col or not credit_col:
        return {
            "applicable": False,
            "message": (
                "Account mapping requires 'Account Name', 'Debit', and 'Credit' "
                "columns to be mapped. This file is missing one or more of these."
            ),
            "accounts": [],
        }

    debit_values = pd.to_numeric(df[debit_col], errors="coerce").fillna(0)
    credit_values = pd.to_numeric(df[credit_col], errors="coerce").fillna(0)

    grouped = pd.DataFrame({
        "account_name": df[account_name_col],
        "debit": debit_values,
        "credit": credit_values,
    }).groupby("account_name", as_index=False).sum()

    unique_names = grouped["account_name"].tolist()
    saved_account_mapping = saved_account_mapping or {}

    names_needing_llm = [n for n in unique_names if n not in saved_account_mapping]
    suggestions = classify_accounts_with_llm(names_needing_llm)

    accounts = []
    for _, row in grouped.iterrows():
        name = row["account_name"]
        saved_entry = saved_account_mapping.get(name)

        if saved_entry:
            category = saved_entry["category"]
            previously_confirmed = True
            warning_acknowledged = saved_entry.get("warning_acknowledged", False)
        else:
            category = suggestions.get(name, "unknown")
            previously_confirmed = False
            warning_acknowledged = False

        warning = check_balance_direction_mismatch(name, category, row["debit"], row["credit"])
        accounts.append({
            "account_name": name,
            "suggested_category": category,
            "total_debit": float(row["debit"]),
            "total_credit": float(row["credit"]),
            "warning": warning,
            "previously_confirmed": previously_confirmed,
            "warning_acknowledged": warning_acknowledged,
        })

    near_duplicates = find_near_duplicate_accounts(unique_names)
    return {
        "applicable": True,
        "categories": list(STANDARD_ACCOUNT_CATEGORIES.keys()),
        "accounts": accounts,
        "near_duplicate_accounts": near_duplicates,
        "message": f"{len(accounts)} unique account(s) found and classified.",
    }