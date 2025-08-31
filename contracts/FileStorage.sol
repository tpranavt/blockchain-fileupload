// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract FileStorage {
    // Structure to hold file metadata
    struct FileRecord {
        bytes32 fileHash;       // SHA-256 or IPFS CID hash of the file content
        string storageType;    // Storage backend: "IPFS", "S3", "Azure"
        address uploader;      // Ethereum address of uploader
        uint256 timestamp;     // Block timestamp of upload
    }

    // Dynamic array to store all records
    FileRecord[] private files;

    // Event to emit on each file upload
    event FileUploaded(bytes32 indexed fileHash, string storageType, address indexed uploader, uint256 timestamp);

    // Upload function to store new file metadata on-chain
    function uploadFile(bytes32 _fileHash, string memory _storageType) public {
        // Create new file record
        FileRecord memory newFile = FileRecord({
            fileHash: _fileHash,
            storageType: _storageType,
            uploader: msg.sender,
            timestamp: block.timestamp
        });

        // Add record to storage array
        files.push(newFile);

        // Emit event for off-chain listeners/verification
        emit FileUploaded(_fileHash, _storageType, msg.sender, block.timestamp);
    }

    // View function to retrieve all uploaded files metadata
    function getFiles() external view returns (FileRecord[] memory) {
        return files;
    }
}
