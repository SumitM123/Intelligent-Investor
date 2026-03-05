import json
from snaptrade_client import SnapTrade
import uuid
import os

snapTrade = SnapTrade(
consumer_key=os.environ["SNAPTRADE_SECRET"],
client_id=os.environ["SNAPTRADE_CLIENT_ID"],
)
