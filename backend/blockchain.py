from web3 import Web3
import json
import os
from config import CONTRACT_ADDRESS, PRIVATE_KEY, WEB3_PROVIDER_URL
import pprint

CONTRACT_ARTIFACT_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",  # go up one directory
    "artifacts",
    "contracts",
    "FileStorage.sol",
    "FileStorage.json"
)

# Connect to Hardhat local node
w3 = Web3(Web3.HTTPProvider(WEB3_PROVIDER_URL))

# Load contract ABI JSON
with open(CONTRACT_ARTIFACT_PATH) as f:
    contract_abi = json.load(f)["abi"]
pprint.pprint(contract_abi)
# Replace with your deployed contract address from Step 5
contract_address = CONTRACT_ADDRESS

contract = w3.eth.contract(address=Web3.to_checksum_address(contract_address), abi=contract_abi)
print(contract_address)   # Should be 0x-prefixed checksum address
print(Web3.is_checksum_address(contract_address))  # Should print True

# Using the first Hardhat account (default unlocked)
account = w3.eth.accounts[0]
private_key = PRIVATE_KEY

def log_file_on_chain(file_hash: str, storage_type: str):
    print(f"contract.functions: {dir(contract.functions)}")
    print(f"uploadFile attribute: {getattr(contract.functions, 'uploadFile', None)}")
    print(type(contract.functions.uploadFile))

    try:
        # Send transaction directly using transact() from unlocked account
        txn_hash = contract.functions.uploadFile(file_hash, storage_type).transact({"from": account})
        print(f"Transaction sent, hash: {txn_hash.hex()}")

        # Wait for the transaction to be mined and get the receipt
        receipt = w3.eth.wait_for_transaction_receipt(txn_hash)
        print(f"Transaction mined in block {receipt.blockNumber}")
        return receipt
    except Exception as e:
        print(f"Error sending transaction: {e}")
        raise
