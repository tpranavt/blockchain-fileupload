import os
import tempfile
import hashlib
import logging
from typing import List, Optional

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, APIRouter
from fastapi.middleware.cors import CORSMiddleware

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from azure.storage.blob import BlobServiceClient, BlobClient

import aiohttp
import aiofiles
import asyncio


from db import file_events_collection

from config import (
    AWS_S3_BUCKET,
    AWS_ACCESS_KEY,
    AWS_SECRET_KEY,
    AZURE_CONN_STRING,
    AZURE_CONTAINER,
)

from blockchain import log_file_on_chain

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # adjust as needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize AWS S3 client
s3_client = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
)

# Initialize Azure Blob client
blob_service_client = BlobServiceClient.from_connection_string(AZURE_CONN_STRING)


async def upload_to_s3(file_path: str, filename: str) -> str:
    try:
        s3_key = f"uploads/{filename}"
        s3_client.upload_file(file_path, AWS_S3_BUCKET, s3_key)
        url = f"https://{AWS_S3_BUCKET}.s3.amazonaws.com/{s3_key}"
        logger.info(f"S3 upload successful for {filename} -> {url}")
        return url
    except (BotoCoreError, ClientError) as e:
        logger.error(f"S3 upload failed for {filename}: {e}")
        raise RuntimeError(f"S3 upload failed: {e}")


async def upload_to_azure(file_path: str, filename: str) -> str:
    try:
        blob_client: BlobClient = blob_service_client.get_blob_client(
            container=AZURE_CONTAINER, blob=filename
        )
        async with aiofiles.open(file_path, "rb") as data:
            content = await data.read()
        blob_client.upload_blob(content, overwrite=True)
        url = f"https://{blob_client.account_name}.blob.core.windows.net/{AZURE_CONTAINER}/{filename}"
        logger.info(f"Azure upload successful for {filename} -> {url}")
        return url
    except Exception as e:
        logger.error(f"Azure Blob upload failed for {filename}: {e}")
        raise RuntimeError(f"Azure Blob upload failed: {e}")


# async def upload_to_ipfs(file_path: str) -> str:
#     headers = {
#         "pinata_api_key": PINATA_API_KEY,
#         "pinata_secret_api_key": PINATA_SECRET_API_KEY,
#     }
#     try:
#         async with aiohttp.ClientSession() as session:
#             form = aiohttp.FormData()
#             async with aiofiles.open(file_path, "rb") as f:
#                 data = await f.read()
#                 form.add_field("file", data, filename=os.path.basename(file_path))
#             async with session.post(
#                 "https://api.pinata.cloud/pinning/pinFileToIPFS",
#                 data=form,
#                 headers=headers
#             ) as resp:
#                 resp.raise_for_status()
#                 response_json = await resp.json()
#                 cid = response_json["IpfsHash"]
#                 logger.info(f"Pinata IPFS upload successful: {cid}")
#                 return cid
#     except Exception as e:
#         logger.error(f"Pinata IPFS upload failed for {file_path}: {e}")
#         raise RuntimeError(f"Pinata IPFS upload failed: {e}")

@app.post("/verify")
async def verify_file(file: UploadFile = File(...)):
    contents = await file.read()  # read once
    file_hash = hashlib.sha256(contents).hexdigest().lower()
    # In your verify endpoint, after computing the hash
    logger.info(f"Verify file {file.filename} with hash: {file_hash}")
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


@app.post("/upload")
async def upload_files(
    files: List[UploadFile] = File(...),
    upload_s3: Optional[bool] = Form(False),
    upload_azure: Optional[bool] = Form(False),
):
    if not any([upload_s3, upload_azure]):
        raise HTTPException(status_code=400, detail="At least one storage option must be selected.")

    responses = []

    for file in files:
        logger.info(f"Processing file: {file.filename}")
        contents = await file.read()  # read once
        file_hash = hashlib.sha256(contents).hexdigest().lower()
        # In your upload endpoint, after computing the hash
        logger.info(f"Upload file {file.filename} with hash: {file_hash}")
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(contents)
            temp_path = tmp.name

        upload_results = {}
        blockchain_receipts = {}

        try:
            if upload_s3:
                try:
                    receipt = await asyncio.to_thread(log_file_on_chain, file_hash, "S3")
                    s3_url = await upload_to_s3(temp_path, file.filename)
                    upload_results["s3"] = s3_url
                    
                    blockchain_receipts["s3"] = receipt.transactionHash.hex()
                except Exception as e:
                    upload_results["s3_error"] = str(e)

            if upload_azure:
                try:
                    azure_url = await upload_to_azure(temp_path, file.filename)
                    upload_results["azure"] = azure_url
                    receipt = await asyncio.to_thread(log_file_on_chain, file_hash, "Azure")
                    blockchain_receipts["azure"] = receipt.transactionHash.hex()
                except Exception as e:
                    upload_results["azure_error"] = str(e)
        finally:
            os.unlink(temp_path)

        responses.append({
            "file_name": file.filename,
            "sha256": file_hash,
            "upload_results": upload_results,
            "blockchain_receipts": blockchain_receipts,
        })

    return responses