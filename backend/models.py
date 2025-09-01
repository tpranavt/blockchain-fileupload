from pydantic import BaseModel, Field, field_validator
from typing import Literal
from datetime import datetime

class FileEvent(BaseModel):
    file_hash: str = Field(..., description="SHA-256 hash of the file")
    filename: str = Field(..., description="Original uploaded filename")
    # uploader: str = Field(..., description="Blockchain uploader address")
    storage: Literal["IPFS", "S3", "Azure"] = Field(..., description="Storage location")
    timestamp: datetime = Field(..., description="Upload timestamp")
    txn_hash: str = Field(..., description="Blockchain transaction hash")

    @field_validator('file_hash')
    @classmethod
    def hash_must_be_lower_hex(cls, v: str) -> str:
        if len(v) != 64 or any(c not in "0123456789abcdef" for c in v):
            raise ValueError('file_hash must be a 64-length lowercase hex string')
        return v
