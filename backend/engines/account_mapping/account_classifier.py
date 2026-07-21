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
    "Revenue": "credit",
    "Other Income": "credit",
    "Cost of Sales": "debit",
    "Operating Expense": "debit",
    "Administrative Expense": "debit",
    "Finance Cost": "debit",
}

# function to classify account names using the LLM and return a mapping of account names to suggested categories
def classify_accounts_with_llm(account_names: list) -> dict:
    """
    Send the list of unique account names to the LLM and asks it to suggest a standard category for each, 
    from the fixed list above.
    Batches requests into chunks to stay within token limits.
    Returns the account name and the suggested category and Falls back to an empty
    suggestion for the auditor to manually classify if the LLM fails or returns an invalid category.
    """
    # If the list is empty, return an empty dictionary
    if not account_names:
        return {}
    categories_list = list(STANDARD_ACCOUNT_CATEGORIES.keys())
    classification = {}
    
    # Batch accounts into chunks of 12 to avoid token limit
    batch_size = 12
    for i in range(0, len(account_names), batch_size):
        batch = account_names[i:i + batch_size]
        # Create a prompt for the LLM to classify the accounts
        prompt = f""" You are a financial accounting expert helping an audit firm classify accounts.
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
        # Send the prompt to the LLM and get the response
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            # The prompt is sent as a system message to the LLM, and the user's message contains the actual prompt text. The temperature is set to 0 for deterministic output, and max_tokens is set to 2000 to allow for a large enough response.
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
        # The LLM's response is expected to be a JSON object mapping account names to categories. We parse this response and update the classification dictionary. If the LLM fails to return valid JSON, we simply skip that batch and continue with the next one.
        raw = response.choices[0].message.content.strip()
        raw = raw.replace("```json", "").replace("```", "").strip()
        # Attempt to parse the LLM's response as JSON and update the classification dictionary. If the response is not valid JSON, we ignore it and continue with the next batch.
        try:
            batch_classification = json.loads(raw)
            classification.update(batch_classification)
        except json.JSONDecodeError:
            pass

    # Ensure every account name has SOME entry, defaulting to "unknown" if the LLM failed to classify it
    for name in account_names:
        if name not in classification:
            classification[name] = "unknown"
    return classification
# Function to check if the account's actual debit/credit balance match what's normally expected for its assigned category
def check_balance_direction_mismatch(account_name: str, category: str, debit_total: float, credit_total: float) -> str | None:
    """
    Check if the account's actual debit/credit balance match what's normally
    expected for its assigned category
    """
    expected_direction = STANDARD_ACCOUNT_CATEGORIES.get(category)
    if expected_direction is None:
        return None
    actual_direction = "debit" if debit_total > credit_total else "credit"
    # If the actual balance direction does not match the expected direction for the category, return a warning message. Otherwise, return None.
    if actual_direction != expected_direction:
        return (
            f"'{account_name}' is classified as '{category}', which usually has a "
            f"{expected_direction} balance, but this account currently shows a "
            f"{actual_direction} balance. Please confirm this classification is correct."
        )
    return None

# Function to find near-duplicate account names using fuzzy string similarity
def find_near_duplicate_accounts(account_names: list) -> list:
    """
    Compares every pair of unique account names using fuzzy string
    similarity, same approach as Cleaning's near-duplicate value check.
    Flags pairs that are very similar (>=90%) but not identical, since
    these likely represent the same real account recorded inconsistently
    (e.g. "Accounts Payable" vs "Accounts Payables"). Excludes pairs that
    only differ by a trailing number, or where one fully contains the
    other, since those usually represent genuinely distinct items rather
    than spelling variants.

    Returns a list of {"account_a": ..., "account_b": ..., "message": ...}
    """
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

            # Only skip if the added part looks like a genuinely separate
            # word/item (more than 3 extra characters), not just a trailing
            # suffix like pluralization ("Payable" vs "Payables") or a small
            # typo, which should still be flagged as likely duplicates
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
            if SIMILARITY_THRESHOLD <= similarity < 1.0:
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
# Function to build the full account mapping suggestion result
def build_account_mapping_result(df: pd.DataFrame, mapping: dict, saved_account_mapping: dict = None) -> dict:
    """
    Builds the full account mapping suggestion result: unique account
    names, their category (from a saved mapping if one exists, otherwise
    freshly suggested by the LLM), sample debit/credit totals, and any
    balance-direction warnings.
    """
    # Check if the required columns are mapped in the provided mapping dictionary. If any of the required columns ("account_name", "debit", "credit") are missing, return a result indicating that the mapping is not applicable and provide a message explaining the issue.
    account_name_col = None
    debit_col = None
    credit_col = None
    # Loop through the mapping dictionary to find the columns that correspond to "account_name", "debit", and "credit"
    for info in mapping.values():
        if isinstance(info, dict):
            if info.get("mapped_to") == "account_name":
                account_name_col = "account_name"
            elif info.get("mapped_to") == "debit":
                debit_col = "debit"
            elif info.get("mapped_to") == "credit":
                credit_col = "credit"
    # Check if all required columns are mapped. If any of them are missing, return a result indicating that the mapping is not applicable and provide a message explaining the issue.
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

    # Group by account name in case the same account appears on multiple rows
    grouped = pd.DataFrame({
        "account_name": df[account_name_col],
        "debit": debit_values,
        "credit": credit_values,
    }).groupby("account_name", as_index=False).sum()
    unique_names = grouped["account_name"].tolist()
    saved_account_mapping = saved_account_mapping or {}

    # Only ask the LLM to classify accounts that haven't already been
    # saved, since we don't want to overwrite the auditor's prior choices
    names_needing_llm = [n for n in unique_names if n not in saved_account_mapping]
    suggestions = classify_accounts_with_llm(names_needing_llm)

    # Build the result list with account details and warnings
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


