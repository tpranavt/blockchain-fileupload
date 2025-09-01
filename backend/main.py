from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from datetime import datetime
import hashlib
import os
import tempfile
import asyncio

from db import file_events_collection
from blockchain import log_file_on_chain, w3

import boto3
from botocore.exceptions import ClientError
from azure.storage.blob import BlobServiceClient, BlobClient
import aiofiles

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # your React frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize AWS and Azure clients with environment variables set
s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY"),
    aws_secret_access_key=os.getenv("AWS_SECRET_KEY"),
)
blob_service_client = BlobServiceClient.from_connection_string(os.getenv("AZURE_CONN_STRING"))
AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET")
AZURE_CONTAINER = os.getenv("AZURE_CONTAINER")


@app.post("/check-file-name")
async def check_file_name(request: Request):
    data = await request.json()
    filename = data.get("filename")
    if not filename:
        raise HTTPException(status_code=400, detail="filename not provided")
    records = await file_events_collection.find({"filename": filename}).to_list(length=100)
    hashes = [record["file_hash"] for record in records]
    return {"exists": len(records) > 0, "hashes": hashes}


async def upload_to_s3(file_path: str, filename: str) -> str:
    try:
        s3_key = f"uploads/{filename}"
        try:
            s3_client.head_object(Bucket=AWS_S3_BUCKET, Key=s3_key)
            raise RuntimeError("File with this name already exists on S3")
        except ClientError:
            pass  # Not found, so safe to upload

        s3_client.upload_file(file_path, AWS_S3_BUCKET, s3_key)
        return f"https://{AWS_S3_BUCKET}.s3.amazonaws.com/{s3_key}"
    except Exception as e:
        raise RuntimeError(f"S3 upload failed: {e}")


async def upload_to_azure(file_path: str, filename: str) -> str:
    try:
        blob_client: BlobClient = blob_service_client.get_blob_client(container=AZURE_CONTAINER, blob=filename)
        if blob_client.exists():
            raise RuntimeError("File with this name already exists on Azure")

        async with aiofiles.open(file_path, "rb") as f:
            content = await f.read()
        blob_client.upload_blob(content)
        return f"https://{blob_client.account_name}.blob.core.windows.net/{AZURE_CONTAINER}/{filename}"
    except Exception as e:
        raise RuntimeError(f"Azure Blob upload failed: {e}")


@app.post("/upload")
async def upload_files(
    files: List[UploadFile] = File(...),
    upload_s3: Optional[bool] = Form(False),
    upload_azure: Optional[bool] = Form(False),
    uploader: Optional[str] = Form(None),
):
    if not (upload_s3 or upload_azure):
        raise HTTPException(status_code=400, detail="At least one storage option must be selected")

    responses = []

    for file in files:
        contents = await file.read()
        file_hash_hex = hashlib.sha256(contents).hexdigest().lower()
        file_hash_bytes32 = bytes.fromhex(file_hash_hex)

        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(contents)
            temp_path = tmp.name

        upload_results = {}
        storage_names = []
        blockchain_receipt = None

        try:
            if upload_s3:
                try:
                    s3_url = await upload_to_s3(temp_path, file.filename)
                    upload_results["s3"] = s3_url
                    storage_names.append("S3")
                except Exception as e:
                    upload_results["s3_error"] = str(e)

            if upload_azure:
                try:
                    azure_url = await upload_to_azure(temp_path, file.filename)
                    upload_results["azure"] = azure_url
                    storage_names.append("Azure")
                except Exception as e:
                    upload_results["azure_error"] = str(e)

            if not storage_names:
                return HTTPException(status_code=400, detail=f"Upload failed for '{file.filename}' on all storages.")

            storage_csv = ",".join(storage_names)
            receipt = await asyncio.to_thread(log_file_on_chain, file_hash_bytes32, storage_csv)
            blockchain_receipt = receipt.transactionHash.hex()
            block = w3.eth.get_block(receipt.blockNumber)
            block_timestamp = block.timestamp
            await file_events_collection.update_one(
                {"file_hash": file_hash_hex},
                {
                    "$set": {
                        "filename": file.filename,
                        "uploader": uploader or "unknown",
                        "storage": storage_names,  # store as list, not CSV string
                        "timestamp": block_timestamp,
                        "txn_hash": blockchain_receipt,
                    }
                },
                upsert=True,
            )
        finally:
            os.unlink(temp_path)

        responses.append({
            "file_name": file.filename,
            "sha256": file_hash_hex,
            "upload_results": upload_results,
            "blockchain_receipt": blockchain_receipt,
        })

    return responses


@app.post("/verify")
async def verify_file(file: UploadFile = File(...)):
    contents = await file.read()
    file_hash = hashlib.sha256(contents).hexdigest().lower()
    record = await file_events_collection.find_one({"file_hash": file_hash})
    if not record:
        raise HTTPException(status_code=404, detail="File hash not found on blockchain")

    return {
        "verified": True,
        "file_hash": file_hash,
        "filename": record.get("filename"),
        "uploaded_by": record.get("uploader"),
        "storage": record.get("storage"),
        "upload_time": record.get("timestamp"),
        "txn_hash": record.get("txn_hash"),
    }
