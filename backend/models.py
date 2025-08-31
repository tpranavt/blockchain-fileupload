from pydantic import BaseModel, Field
from typing import Literal
from datetime import datetime

class FileEvent(BaseModel):
    file_hash: str = Field(..., description="SHA-256 hash of the file")
    filename: str = Field(..., description="Original uploaded filename")
    uploader: str = Field(..., description="Blockchain uploader address")
    storage: Literal["IPFS", "S3", "Azure"] = Field(..., description="Storage location")
    timestamp: datetime = Field(..., description="Upload timestamp")
    txn_hash: str = Field(..., description="Blockchain transaction hash")
