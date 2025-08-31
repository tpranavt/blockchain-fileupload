import asyncio
from datetime import datetime, timezone
from db import file_events_collection
from models import FileEvent
import json
import os
from web3 import Web3
from config import CONTRACT_ADDRESS, WEB3_PROVIDER_URL
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CONTRACT_ARTIFACT_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",  # go up one directory
    "artifacts",
    "contracts",
    "FileStorage.sol",
    "FileStorage.json"
)

w3 = Web3(Web3.HTTPProvider(WEB3_PROVIDER_URL))
if not w3.is_connected():
    raise RuntimeError("Web3 provider is not connected. Please check WEB3_PROVIDER_URL")

with open(CONTRACT_ARTIFACT_PATH) as f:
    contract_abi = json.load(f)["abi"]

contract_address = CONTRACT_ADDRESS
contract = w3.eth.contract(address=Web3.to_checksum_address(contract_address), abi=contract_abi)

async def save_event_to_db(doc):
    try:
        await file_events_collection.update_one(
            {"file_hash": doc["file_hash"]},
            {"$set": doc},
            upsert=True
        )
        logger.info(f"Indexed file hash {doc['file_hash']} from tx {doc['txn_hash']}")
    except Exception as e:
        logger.error(f"Error updating MongoDB: {e}", exc_info=True)

def handle_event(event):
    try:
        raw_hash = event['args']['fileHash']
        # If it is bytes, convert to hex string
        if isinstance(raw_hash, bytes):
            file_hash_str = raw_hash.hex()
        else:
            file_hash_str = raw_hash  # assume already string
        data = {
            "file_hash": file_hash_str,  # use the processed string
            "filename": "unknown",  # not provided in event, default
            "uploader": event['args']['uploader'],
            "storage": event['args']['storageType'],  # correct key from ABI
            "timestamp": datetime.fromtimestamp(event['args']['timestamp'], tz=timezone.utc),
            "txn_hash": event['transactionHash'].hex(),
        }
        file_event = FileEvent(**data)
        doc = file_event.model_dump()
        # Schedule the async DB update in the event loop
        asyncio.get_event_loop().create_task(save_event_to_db(doc))
    except Exception as e:
        logger.error(f"Failed to handle event data: {e}", exc_info=True)

async def log_loop():
    event_filter = contract.events.FileUploaded.create_filter(from_block="latest")
    while True:
        try:
            for event in event_filter.get_new_entries():
                handle_event(event)
        except Exception as e:
            logger.error(f"Failed to fetch or process events: {e}", exc_info=True)
        await asyncio.sleep(10)

if __name__ == "__main__":
    asyncio.run(log_loop())
