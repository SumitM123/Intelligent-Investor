# SnapTrade Context

SnapTrade is a platform that lets developers connect users' brokerage accounts to their app, providing access to live positions, holdings, transactions, and trading across multiple brokerages through a single unified API. It is designed for fintech apps that want portfolio tracking and order management without building direct integrations with each individual brokerage.

Fetch the SnapTrade Python SDK documentation and load it as context for the current task.

Use WebFetch to retrieve the SDK overview from: https://pypi.org/project/snaptrade-python-sdk/

Then use that page to find and fetch the relevant SDK reference docs, focusing on the methods used in backend/routes/snapTrade.py:
- `authentication.register_snap_trade_user`
- `authentication.login_snap_trade_user`
- `account_information.list_user_accounts`
- `account_information.get_user_account_details`
- `account_information.get_account_activities`
- `account_information.get_user_account_positions`

For each method, summarize:
- Required and optional parameters
- Return shape (what `.body` contains)
- Any relevant notes or caveats

Once done, confirm you have the context loaded and are ready to help with backend/routes/snapTrade.py.

---

## Patterns in backend/routes/snapTrade.py

- Auth from cookies; extra inputs as query params
- Always call `getSnapTradeSecretID()` first in a `try/except`, raise `HTTP_400_BAD_REQUEST` if missing
- SDK calls always pass `user_id` + `user_secret`; results accessed via `.body`
- DB: `with SessionLocal() as session` + `session.rollback()` in `except`
- Data routes: query DB first, fetch from SnapTrade on cache miss and persist
- `stock_symbol`: regex-validate and uppercase at top of function
- All datetimes must be timezone-aware, converted to `America/New_York`
