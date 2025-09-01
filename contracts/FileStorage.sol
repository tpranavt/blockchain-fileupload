// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract FileStorage {
    
    struct FileRecord {
        bytes32 fileHash;                  // SHA-256 hash of the file content
        string storageType;                // Storage backend: "IPFS", "S3", "Azure"
        uint256 timestamp;                 // Block timestamp of upload
    }

    FileRecord[] private files;

    event FileUploaded(bytes32 indexed fileHash, string storageType, uint256 timestamp);

    function uploadFile(bytes32 _fileHash, string memory _storageType) public {
        FileRecord memory newFile = FileRecord({
            fileHash: _fileHash,
            storageType: _storageType,
            timestamp: block.timestamp
        });

        files.push(newFile);

        emit FileUploaded(_fileHash, _storageType, block.timestamp);
    }

    function getFiles() external view returns (FileRecord[] memory) {
        return files;
    }
}
