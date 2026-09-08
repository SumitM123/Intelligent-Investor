import json
from snaptrade_client import SnapTrade
from snaptrade_client.auth import SnapTradeAuth
import uuid
import os

snapTrade = SnapTrade(
    auth=SnapTradeAuth.commercial_api_key(
        consumer_key=os.environ["SNAPTRADE_SECRET"],
        client_id=os.environ["SNAPTRADE_CLIENT_ID"],
    )
)

