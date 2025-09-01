from web3 import Web3
import json
import os
from config import CONTRACT_ADDRESS, WEB3_PROVIDER_URL

contract_artifact_path = os.path.join(
    os.path.dirname(__file__), "..", "artifacts", "contracts", "FileStorage.sol", "FileStorage.json"
)

w3 = Web3(Web3.HTTPProvider(WEB3_PROVIDER_URL))
w3.eth.default_account = w3.eth.accounts[0]  # Or set your account here

with open(contract_artifact_path) as f:
    contract_abi = json.load(f)["abi"]

contract = w3.eth.contract(address=Web3.to_checksum_address(CONTRACT_ADDRESS), abi=contract_abi)

def log_file_on_chain(file_hash_bytes32: bytes, storage_type: str):
    try:
        txn_hash = contract.functions.uploadFile(file_hash_bytes32, storage_type).transact()
        receipt = w3.eth.wait_for_transaction_receipt(txn_hash)
        print(f"File uploaded: TX {txn_hash.hex()} in block {receipt.blockNumber}")
        return receipt
    except Exception as e:
        print(f"Error in uploadFile transaction: {e}")
        raise
